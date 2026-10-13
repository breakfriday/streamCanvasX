import type Mpegts from '../../d.ts/mpegts';

export interface VideoDecoderCallbacks {
    /** Ownership passes to the callback, which must close or transfer the frame. */
    onFrame(frame: VideoFrame): void;
    onError(error: Error): void;
    onDequeue?(): void;
}

export type VideoConfig = Mpegts.EncodedVideoConfig;
export type VideoSample = Mpegts.EncodedSample;
