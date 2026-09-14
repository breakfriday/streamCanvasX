
interface IAACFrame{
    crc32?: string;
    data?: Uint8Array;
    duration?: number;
    frameNumber?: number;
    samples?: number;
    totalBytesOut?: number;
    headers?: IAACHeader;
    codecFrames?: any;

}

interface IAACHeader{
    bitDepth?: number;
    bitrate?: number;
    bufferFullness?: number;
    channelMode?: string;//    'monophonic (mono)'
    channels?: number;
    copyrightId?: boolean;
    copyrightIdStart?: boolean;
    isHome?: boolean;
    isOriginal?: boolean;
    isPrivate?: boolean;
    layer?: string; // 'valid';
    length?: number; // 7;
    mpegVersion?: string; // 'MPEG-4';
    numberAACFrames?: number;
    profile?: string; // 'AAC LC (Low Complexity)';
    protection?: string; // 'none';
    sampleRate?: number; // 32000;
}


interface IAACfames{
    frames: Array<IAACFrame>;
    IframsData: Array<Uint8Array>;
    bufferData: Uint8Array;
}