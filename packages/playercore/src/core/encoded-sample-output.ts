import type {EncodedSample, TrackConfig, TrackType} from './decode-stream-events';

/** Structural contracts at the existing JavaScript FLVDemuxer boundary. */
export interface DemuxVideoMetadata {
    codec: string;
    avcc?: Uint8Array;
    hvcc?: Uint8Array;
    codecWidth: number;
    codecHeight: number;
    presentWidth: number;
    presentHeight: number;
}

export interface DemuxAudioMetadata {
    codec: string;
    config?: number[] | Uint8Array;
    audioSampleRate: number;
    channelCount: number;
}

export type DemuxMetadataArgs =
    | [type: 'video', metadata: DemuxVideoMetadata]
    | [type: 'audio', metadata: DemuxAudioMetadata];

interface DemuxSample {
    dts: number;
    pts: number;
}

interface DemuxVideoSample extends DemuxSample {
    units: Array<{data: Uint8Array}>;
    isKeyframe: boolean;
}

interface DemuxAudioSample extends DemuxSample {
    unit: Uint8Array;
}

export interface DemuxAudioTrack {
    type: 'audio';
    samples: DemuxAudioSample[];
    length: number;
}

export interface DemuxVideoTrack {
    type: 'video';
    samples: DemuxVideoSample[];
    length: number;
}

interface OutputCallbacks {
    onConfig: (config: TrackConfig) => void;
    onSample: (sample: EncodedSample) => void;
}

/**
 * Consumes FLVDemuxer tracks without remuxing. Output buffers are owned copies:
 * listeners may retain/transfer them after IO reuses its stash buffer.
 * DTS/PTS are microseconds, with the demuxer's original timeline preserved.
 */
class EncodedSampleOutput {
    private _onConfig: OutputCallbacks['onConfig'] | null;
    private _onSample: OutputCallbacks['onSample'] | null;
    private _configs: Map<TrackType, Pick<TrackConfig, 'codec' | 'configId'>>;
    private _destroyed: boolean;

    constructor({onConfig, onSample}: OutputCallbacks) {
        this._onConfig = onConfig;
        this._onSample = onSample;
        this._configs = new Map();
        this._destroyed = false;
    }

    handleMetadata(...[type, metadata]: DemuxMetadataArgs): void {
        if (this._destroyed) return;
        const previous = this._configs.get(type);
        const configId = (previous?.configId || 0) + 1;
        let config: TrackConfig;
        if (type === 'video') {
            const description = metadata.avcc || metadata.hvcc;
            if (!description || !metadata.codec) {
                throw new Error('Encoded output supports AVC/HEVC video configuration only');
            }
            config = {
                type, codec: metadata.codec, configId,
                description: new Uint8Array(description),
                codedWidth: metadata.codecWidth,
                codedHeight: metadata.codecHeight,
                displayWidth: metadata.presentWidth,
                displayHeight: metadata.presentHeight
            };
        } else if (type === 'audio') {
            if (!metadata.codec) throw new Error('Missing audio codec configuration');
            // Keep codec paired with config. The existing demuxer may apply AAC
            // browser compatibility adjustments; originalCodec is not that pair.
            config = {
                type, codec: metadata.codec, configId,
                sampleRate: metadata.audioSampleRate,
                numberOfChannels: metadata.channelCount
            };
            if (metadata.config) config.description = new Uint8Array(metadata.config);
        } else {
            throw new Error(`Unsupported track type: ${type}`);
        }
        // Keep only scalar identity internally so listener mutations/transfers
        // cannot alter subsequent sample routing.
        this._configs.set(type, {codec: config.codec, configId: config.configId});
        this._onConfig?.(config);
    }

    consumeTracks(audioTrack: DemuxAudioTrack | null, videoTrack: DemuxVideoTrack | null): void {
        // Drain BOTH tracks before invoking listeners (which may stop/destroy).
        const tracks = [audioTrack, videoTrack].filter(
            (track): track is DemuxAudioTrack | DemuxVideoTrack => track !== null
        ).map(track => {
            const samples = track.samples;
            track.samples = [];
            track.length = 0;
            return {type: track.type, samples};
        });
        for (const {type, samples} of tracks) {
            for (const sample of samples) {
                if (this._destroyed) return;
                const config = this._configs.get(type);
                if (!config) throw new Error(`Missing ${type} configuration before sample`);
                let data: Uint8Array;
                if ('units' in sample) {
                    // One access unit per sample; retain each NALU's length prefix.
                    const size = sample.units.reduce((sum, unit) => sum + unit.data.byteLength, 0);
                    data = new Uint8Array(size);
                    let offset = 0;
                    for (const unit of sample.units) {
                        data.set(unit.data, offset);
                        offset += unit.data.byteLength;
                    }
                } else {
                    data = new Uint8Array(sample.unit);
                }
                const dts = sample.dts * 1000;
                const pts = sample.pts * 1000;
                if (!Number.isSafeInteger(dts) || !Number.isSafeInteger(pts)) {
                    throw new Error('Invalid encoded sample timestamp');
                }
                this._onSample?.({
                    type, codec: config.codec, configId: config.configId,
                    data, dts, pts, timebase: 1000000,
                    isKeyframe: type === 'audio' || ('isKeyframe' in sample && sample.isKeyframe === true)
                });
            }
        }
    }

    destroy(): void {
        this._destroyed = true;
        this._configs.clear();
        this._onConfig = this._onSample = null;
    }
}

export default EncodedSampleOutput;
