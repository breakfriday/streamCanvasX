import type Mpegts from '../../d.ts/mpegts';

// Reuse the public data contracts so implementation and package types agree.
export type TrackType = 'audio' | 'video';
export type TrackConfig = Mpegts.EncodedAudioConfig | Mpegts.EncodedVideoConfig;
export type EncodedSample = Mpegts.EncodedSample;
export type DecodeStreamEventMap = Mpegts.DecodeStreamEventMap;
export type DecodeStreamState = Mpegts.DecodeStream['state'];
export type DecodeStreamError = DecodeStreamEventMap['error'];
export type PCMData = DecodeStreamEventMap['pcm_data'];

// Separate from the MSE/transmuxing events: these carry samples, not MP4 segments.
const DecodeStreamEvents = Object.freeze({
    TRACK_CONFIG: 'track_config',
    ENCODED_SAMPLE: 'encoded_sample',
    PCM_DATA: 'pcm_data',
    MEDIA_INFO: 'media_info',
    METADATA_ARRIVED: 'metadata_arrived',
    SCRIPTDATA_ARRIVED: 'scriptdata_arrived',
    STATISTICS_INFO: 'statistics_info',
    DISCONTINUITY: 'discontinuity',
    RECOVERED_EARLY_EOF: 'recovered_early_eof',
    LOADING_COMPLETE: 'loading_complete',
    ERROR: 'error'
} as const);

export default DecodeStreamEvents;
