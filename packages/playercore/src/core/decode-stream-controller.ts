import EventEmitter from 'events';
import type Mpegts from '../../d.ts/mpegts';
import {createDefaultConfig} from '../config.js';
import IOController from '../io/io-controller.js';
import FLVDemuxer from '../demux/flv-demuxer.js';
import DemuxErrors from '../demux/demux-errors.js';
import {LoaderErrors} from '../io/loader.js';
import EncodedSampleOutput from './encoded-sample-output';
import type {DemuxMetadataArgs, DemuxAudioTrack, DemuxVideoTrack} from './encoded-sample-output';
import Events from './decode-stream-events';
import type {DecodeStreamEventMap, DecodeStreamState, DecodeStreamError, PCMData} from './decode-stream-events';

type StreamSource = Mpegts.MediaDataSource & {referrerPolicy?: ReferrerPolicy};
type StreamConfig = Mpegts.StreamConfig;
type EventArgs<K extends keyof DecodeStreamEventMap> =
    DecodeStreamEventMap[K] extends void ? [] : [data: DecodeStreamEventMap[K]];

interface StreamSession {
    io: IOController | null;
    demuxer: FLVDemuxer | null;
    output: EncodedSampleOutput;
    timer: ReturnType<typeof setInterval> | null;
    pendingBytes: number;
}

interface FLVProbe {
    match: true;
    consumed: number;
    dataOffset: number;
    hasAudioTrack: boolean;
    hasVideoTrack: boolean;
}

type FLVProbeResult = FLVProbe | {match: false} | {needMoreData: true; match?: false};

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** FLV -> encoded samples/PCM. No MSE, remuxer or decoder is created here. */
class DecodeStreamController implements Mpegts.DecodeStream {
    private _source: StreamSource | null;
    private _config: StreamConfig | null;
    private readonly _emitter: EventEmitter;
    private _session: StreamSession | null;
    private _state: DecodeStreamState;

    constructor(source: Mpegts.MediaDataSource, config: Mpegts.StreamConfig = {}) {
        if (config.webcodec !== true) {
            throw new TypeError('DecodeStreamController requires webcodec: true; use createStream for default MSE routing');
        }
        if (!source || source.type !== 'flv' || !source.url || source.segments) {
            throw new TypeError('DecodeStreamController requires a single FLV URL (multipart/seek are not supported)');
        }
        if (config.enableWorker === true) {
            throw new TypeError('DecodeStreamController Worker transport is not implemented; use enableWorker: false');
        }
        this._source = {...source, cors: source.cors !== false, withCredentials: source.withCredentials === true};
        // The legacy JS defaults widen seekType to string; the public contract
        // supplies the range/param/custom union without changing that module.
        this._config = {...createDefaultConfig() as Mpegts.Config, ...config};
        if (typeof source.isLive === 'boolean') this._config.isLive = source.isLive;
        if (config.referrerPolicy) this._source.referrerPolicy = config.referrerPolicy;
        this._emitter = new EventEmitter();
        this._session = null;
        this._state = 'idle';
    }

    get state(): DecodeStreamState { return this._state; }

    on<K extends keyof DecodeStreamEventMap>(event: K, listener: (data: DecodeStreamEventMap[K]) => void): this {
        this._assertAlive();
        this._emitter.on(event, listener);
        return this;
    }

    off<K extends keyof DecodeStreamEventMap>(event: K, listener: (data: DecodeStreamEventMap[K]) => void): this {
        this._emitter.off(event, listener);
        return this;
    }

    private _assertAlive(): void {
        if (this._state === 'destroyed') throw new Error('DecodeStreamController is destroyed');
    }

    private _isCurrent(session: StreamSession): boolean { return this._session === session; }

    private _emit<K extends keyof DecodeStreamEventMap>(session: StreamSession, event: K, ...args: EventArgs<K>): void {
        if (this._isCurrent(session)) this._emitter.emit(event, ...args);
    }

    start(): void {
        this._assertAlive();
        if (this._session) return;
        const session: StreamSession = {
            io: null, demuxer: null, timer: null, pendingBytes: 0,
            output: new EncodedSampleOutput({
                onConfig: config => this._emit(session, Events.TRACK_CONFIG, config),
                onSample: sample => this._emit(session, Events.ENCODED_SAMPLE, sample)
            })
        };
        this._session = session;
        this._state = 'running';
        try {
            const io = session.io = new IOController({...this._source}, this._config, 0);
            // Keep this guarded wrapper instead of replacing it via bindDataSource:
            // stale IO callbacks must not enter a stopped session's demuxer.
            io.onDataArrival = (data: ArrayBuffer, byteStart: number) => this._consume(session, data, byteStart);
            io.onError = (detail: string, info: Mpegts.LoaderErrorMessage) => this._fail(session, 'network', detail, info);
            io.onSeeked = () => this._emit(session, Events.DISCONTINUITY, {reason: 'io-seek'});
            io.onRecoveredEarlyEof = () => this._emit(session, Events.RECOVERED_EARLY_EOF);
            io.onComplete = () => this._complete(session);
            io.open();
            if (this._isCurrent(session)) {
                session.timer = setInterval(() => this._reportStatistics(session), this._config.statisticsInfoReportInterval);
            }
        } catch (error) {
            if (!this._isCurrent(session)) throw error;
            this._fail(session, 'network', LoaderErrors.EXCEPTION, {code: -1, msg: errorMessage(error)});
        }
    }

    private _consume(session: StreamSession, data: ArrayBuffer, byteStart: number): number {
        if (!this._isCurrent(session)) return data.byteLength;
        try {
            if (!session.demuxer) {
                const probe = FLVDemuxer.probe(data) as FLVProbeResult;
                if ('needMoreData' in probe && probe.needMoreData) {
                    session.pendingBytes = data.byteLength;
                    return 0;
                }
                if (!probe.match) {
                    this._fail(session, 'demux', DemuxErrors.FORMAT_UNSUPPORTED, {msg: 'Expected FLV stream'});
                    return data.byteLength;
                }
                if (data.byteLength < probe.dataOffset + 4) {
                    session.pendingBytes = data.byteLength;
                    return 0;
                }
                this._setupDemuxer(session, probe);
            }
            const consumed = session.demuxer.parseChunks(data, byteStart);
            session.pendingBytes = data.byteLength - consumed;
            return consumed;
        } catch (error) {
            // Includes malformed FLV bounds and sample-format errors.
            if (!this._isCurrent(session)) throw error;
            this._fail(session, 'demux', DemuxErrors.FORMAT_ERROR, {msg: errorMessage(error)});
            return data.byteLength;
        }
    }

    private _setupDemuxer(session: StreamSession, probe: FLVProbe): void {
        const demuxer = session.demuxer = new FLVDemuxer(probe, this._config);
        const source = this._source;
        if (Number.isFinite(source.duration)) demuxer.overridedDuration = source.duration;
        if (typeof source.hasAudio === 'boolean') demuxer.overridedHasAudio = source.hasAudio;
        if (typeof source.hasVideo === 'boolean') demuxer.overridedHasVideo = source.hasVideo;
        demuxer.onError = (detail: string, message: string) => this._fail(session, 'demux', detail, {msg: message});
        demuxer.onMediaInfo = (info: Mpegts.MSEPlayerMediaInfo) => this._emit(session, Events.MEDIA_INFO, {...info});
        demuxer.onMetaDataArrived = (info: object) => this._emit(session, Events.METADATA_ARRIVED, info);
        demuxer.onScriptDataArrived = (info: object) => this._emit(session, Events.SCRIPTDATA_ARRIVED, info);
        demuxer.onTrackMetadata = (...args: DemuxMetadataArgs) => session.output.handleMetadata(...args);
        demuxer.onDataAvailable = (audio: DemuxAudioTrack, video: DemuxVideoTrack) => session.output.consumeTracks(audio, video);
        demuxer.onAudioBuffer = (_type: string, payload: PCMData) => this._emit(session, Events.PCM_DATA, {
            data: payload.data.slice(0), info: {...payload.info}
        });
    }

    private _complete(session: StreamSession): void {
        if (!this._isCurrent(session)) return;
        if (!session.demuxer || session.pendingBytes) {
            this._fail(session, 'demux', DemuxErrors.FORMAT_ERROR, {msg: 'Incomplete FLV header or tag at end of stream'});
            return;
        }
        // A final sequence-header tag can suppress the demuxer's normal batch
        // callback. Drain any remaining samples before announcing completion.
        try {
            // JS track.type is inferred as string; these are the fixed audio/video
            // tracks created by the existing FLVDemuxer constructor.
            session.output.consumeTracks(
                session.demuxer._audioTrack as DemuxAudioTrack,
                session.demuxer._videoTrack as DemuxVideoTrack
            );
        } catch (error) {
            if (!this._isCurrent(session)) throw error;
            this._fail(session, 'demux', DemuxErrors.FORMAT_ERROR, {msg: errorMessage(error)});
            return;
        }
        if (!this._isCurrent(session)) return;
        this._retire(session, 'complete');
        this._emitter.emit(Events.LOADING_COMPLETE);
    }

    private _fail(session: StreamSession, type: DecodeStreamError['type'], detail: string, info: {msg: string; code?: number}): void {
        if (!this._isCurrent(session)) return;
        this._retire(session, 'error');
        // An EventEmitter 'error' without listeners throws; cleanup is already
        // scheduled so even that conventional behavior cannot leak the IO.
        const error: DecodeStreamError = {type, detail, ...info};
        this._emitter.emit(Events.ERROR, error);
    }

    private _reportStatistics(session: StreamSession): void {
        if (!this._isCurrent(session)) return;
        const io = session.io;
        this._emit(session, Events.STATISTICS_INFO, {
            url: io.currentURL, hasRedirect: io.hasRedirect,
            redirectedURL: io.currentRedirectedURL, speed: io.currentSpeed,
            loaderType: io.loaderType
        });
    }

    private _retire(session: StreamSession, state: DecodeStreamState): void {
        this._session = null;
        this._state = state;
        clearInterval(session.timer);
        session.output.destroy();
        // A listener may stop/destroy/start while FLVDemuxer and IOController are
        // still on the stack. Invalidate output immediately, release after return.
        queueMicrotask(() => {
            try { session.io?.destroy(); }
            finally { session.demuxer?.destroy(); }
        });
    }

    stop(): void {
        if (this._state === 'destroyed') return;
        if (this._session) this._retire(this._session, 'stopped');
        else this._state = 'stopped';
    }

    destroy(): void {
        if (this._state === 'destroyed') return;
        this.stop();
        this._state = 'destroyed';
        this._source = this._config = null;
        this._emitter.removeAllListeners();
    }
}

export default DecodeStreamController;
