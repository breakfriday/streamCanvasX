export type VideoRenderBackend = 'webgl' | 'webgpu';

export interface VideoPresentationState {
    state: 'buffering' | 'playing' | 'rebuffering' | 'ended';
    queuedFrames: number;
    bufferedAheadMs: number;
    presentedPTS: number | null;
    discardBeforePTS?: number | null;
}

export interface VideoFrameRenderer {
    readonly kind: VideoRenderBackend;
    readonly canvas: HTMLCanvasElement;
    /** Borrowed frame; submit synchronously. The caller closes it afterwards. */
    draw(frame: VideoFrame): void;
    destroy(): void;
}

export interface VideoRendererOptions extends VideoFrameQueueOptions {
    backend?: VideoRenderBackend;
    onRendered?: () => void;
    onBackendChanged?: (backend: VideoRenderBackend, fallbackReason?: string) => void;
    onError?: (error: Error) => void;
    /** Report after accepting, consuming or dropping retained frames. */
    onPresentationState?: (state: VideoPresentationState) => void;
}
import type {VideoFrameQueueOptions} from './video-frame-queue';
