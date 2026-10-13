import DecodeStreamEvents from './decode-stream-events';

const DecodePipelineEvents = Object.freeze({
    ...DecodeStreamEvents,
    VIDEO_FRAME: 'video_frame',
    DECODE_COMPLETE: 'decode_complete',
    VIDEO_BUFFER_STATS: 'video_buffer_stats',
    VIDEO_RESET: 'video_reset',
    VIDEO_LIVE_EDGE: 'video_live_edge'
} as const);

export default DecodePipelineEvents;
