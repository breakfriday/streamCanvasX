// Types.ts

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

export enum ErrorTypes {
    NETWORK_ERROR,
    MEDIA_ERROR,
   
}

export enum ErrorDetails {
    MEDIA_MSE_ERROR,
   
}

export enum PlayerEvents {
    DESTROYING,
    MEDIA_INFO,
    STATISTICS_INFO,
    ERROR,
    LOADING_COMPLETE,
    METADATA_ARRIVED,
    SCRIPTDATA_ARRIVED,
    TIMED_ID3_METADATA_ARRIVED,
    SMPTE2038_METADATA_ARRIVED,
    SCTE35_METADATA_ARRIVED,
    PES_PRIVATE_DATA_DESCRIPTOR,
    PES_PRIVATE_DATA_ARRIVED,
    // ... other player events
}

export enum MSEEvents {
    UPDATE_END,
    BUFFER_FULL,
    SOURCE_OPEN,
    ERROR,
}

export enum TransmuxingEvents {
    INIT_SEGMENT,
    MEDIA_SEGMENT,
    AUDIO_SEGMENT,
    LOADING_COMPLETE,
    RECOVERED_EARLY_EOF,
    IO_ERROR,
    DEMUX_ERROR,
    MEDIA_INFO,
    METADATA_ARRIVED,
    SCRIPTDATA_ARRIVED,
    TIMED_ID3_METADATA_ARRIVED,
    SMPTE2038_METADATA_ARRIVED,
    SCTE35_METADATA_ARRIVED,
    PES_PRIVATE_DATA_DESCRIPTOR,
    PES_PRIVATE_DATA_ARRIVED,
    STATISTICS_INFO,
    RECOMMEND_SEEKPOINT,
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

