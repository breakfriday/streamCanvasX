import mpegts from '../';
import {createStream, DecodeStreamEvents, createDecodePipeline, DecodePipelineEvents} from '../';

type LoaderStatusAlias = mpegts.LoaderStatus;
type LoaderErrorsAlias = mpegts.LoaderErrors;

interface MediaDataSourceExt extends mpegts.MediaDataSource {
    example: string;
}

function verifyPCMListener(player: mpegts.Player) {
    player.on('audio_segment', (buffer, info) => {
        const pcm: ArrayBuffer = buffer;
        const sampleRate: number = info.sampleRate;
        const channelCount: 1 | 2 = info.channelCount;
        const format: 's16le' = info.format;
    });
    const legacyListener = (buffer: ArrayBuffer) => {};
    player.on('audio_segment', legacyListener);
    player.off('audio_segment', legacyListener);
}

function verifyStreamTypes(webcodec: boolean) {
    const source = {type: 'flv', url: '/live.flv', isLive: true};
    const legacy: mpegts.Player = createStream(source);
    const explicitLegacy: mpegts.Player = mpegts.createStream(source, {webcodec: false});
    const stream: mpegts.DecodeStream = createStream(source, {webcodec: true});
    stream.on(DecodeStreamEvents.TRACK_CONFIG, config => {
        if (config.type === 'video') {
            const width: number = config.codedWidth;
            const description: Uint8Array = config.description;
        } else {
            const channels: number = config.numberOfChannels;
        }
    });
    stream.on(DecodeStreamEvents.ENCODED_SAMPLE, sample => {
        const bytes: Uint8Array = sample.data;
        const timebase: 1000000 = sample.timebase;
    });
    stream.on(DecodeStreamEvents.PCM_DATA, ({data, info}) => {
        const buffer: ArrayBuffer = data;
        const format: 's16le' = info.format;
    });
    const selected: mpegts.Player | mpegts.DecodeStream = createStream(source, {webcodec});
    // @ts-expect-error Encoded stream is not an HTMLMediaElement player.
    stream.attachMediaElement(document.createElement('video'));
}

function verifyDecodePipelineTypes() {
    const pipeline: mpegts.DecodePipeline = createDecodePipeline(
        {type: 'flv', url: '/live.flv'}, {webcodec: true, enableWorker: false, emitEncodedSamples: true}
    );
    pipeline.on(DecodePipelineEvents.VIDEO_FRAME, frame => {
        const video: VideoFrame = frame;
        const timestamp: number = frame.timestamp;
    });
    pipeline.on(DecodePipelineEvents.ERROR, error => {
        const category: 'network' | 'demux' | 'worker' | 'decode' = error.type;
    });
    pipeline.updatePresentationState({state: 'playing', queuedFrames: 3, bufferedAheadMs: 100, presentedPTS: 1000000});
    pipeline.on(DecodePipelineEvents.VIDEO_BUFFER_STATS, stats => {
        const queued: number = stats.encodedFrames;
    });
    pipeline.on(DecodePipelineEvents.VIDEO_RESET, event => {
        const reason: string = event.reason;
    });
    pipeline.on(DecodePipelineEvents.VIDEO_LIVE_EDGE, event => {
        const pts: number = event.pts;
    });
    // @ts-expect-error Decoding requires explicit opt-in.
    createDecodePipeline({type: 'flv', url: '/live.flv'}, {webcodec: false});
}
