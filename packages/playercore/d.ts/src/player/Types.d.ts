export interface MediaDataSource {
    type: string;
    isLive?: boolean;
    url: string;
}
export interface Config {
    isLive?: boolean;
    deferLoadAfterSourceOpen?: boolean;
    accurateSeek?: boolean;
    lazyLoad?: boolean;
    lazyLoadMaxDuration?: number;
    lazyLoadRecoverDuration?: number;
    liveBufferLatencyChasing?: boolean;
    liveBufferLatencyMaxLatency?: number;
    liveBufferLatencyMinRemain?: number;
}
export declare enum ErrorTypes {
    NETWORK_ERROR = 0,
    MEDIA_ERROR = 1
}
export declare enum ErrorDetails {
    MEDIA_MSE_ERROR = 0
}
export declare enum PlayerEvents {
    DESTROYING = 0,
    MEDIA_INFO = 1,
    STATISTICS_INFO = 2,
    ERROR = 3,
    LOADING_COMPLETE = 4,
    METADATA_ARRIVED = 5,
    SCRIPTDATA_ARRIVED = 6,
    TIMED_ID3_METADATA_ARRIVED = 7,
    SMPTE2038_METADATA_ARRIVED = 8,
    SCTE35_METADATA_ARRIVED = 9,
    PES_PRIVATE_DATA_DESCRIPTOR = 10,
    PES_PRIVATE_DATA_ARRIVED = 11
}
export declare enum MSEEvents {
    UPDATE_END = 0,
    BUFFER_FULL = 1,
    SOURCE_OPEN = 2,
    ERROR = 3
}
export declare enum TransmuxingEvents {
    INIT_SEGMENT = 0,
    MEDIA_SEGMENT = 1,
    AUDIO_SEGMENT = 2,
    LOADING_COMPLETE = 3,
    RECOVERED_EARLY_EOF = 4,
    IO_ERROR = 5,
    DEMUX_ERROR = 6,
    MEDIA_INFO = 7,
    METADATA_ARRIVED = 8,
    SCRIPTDATA_ARRIVED = 9,
    TIMED_ID3_METADATA_ARRIVED = 10,
    SMPTE2038_METADATA_ARRIVED = 11,
    SCTE35_METADATA_ARRIVED = 12,
    PES_PRIVATE_DATA_DESCRIPTOR = 13,
    PES_PRIVATE_DATA_ARRIVED = 14,
    STATISTICS_INFO = 15,
    RECOMMEND_SEEKPOINT = 16
}
export interface Browser {
    chrome: boolean;
    firefox: boolean;
    safari: boolean;
    ie: boolean;
    edge: boolean;
    version: {
        major: number;
        minor?: number;
        build?: number;
    };
}
