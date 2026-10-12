import mpegts from '../';
import {createStream, DecodeStreamEvents} from '../';

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
