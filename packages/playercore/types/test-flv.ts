import mpegts from '../';

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
