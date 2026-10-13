import WebCodecsWebGLRenderer from './webcodecs-webgl-renderer';
import WebCodecsWebGPURenderer from './webcodecs-webgpu-renderer';
import type {VideoFrameRenderer, VideoRendererOptions} from './webcodecs-renderer-types';
import VideoFrameQueue from './video-frame-queue';

/** Bounded PTS presentation queue shared by both backends. Video-only clock. */
export default class WebCodecsVideoRenderer {
    readonly ready: Promise<void>;
    private backend: VideoFrameRenderer | null = null;
    private queue: VideoFrameQueue<VideoFrame>;
    private renderTimes: number[] = [];
    private animation = 0;
    private destroyed = false;
    private failed = false;
    private initialization = new AbortController();

    constructor(private container: HTMLElement, private options: VideoRendererOptions = {}) {
        this.queue = new VideoFrameQueue<VideoFrame>(options);
        this.ready = this.initialize();
    }

    get canvas(): HTMLCanvasElement | undefined { return this.backend?.canvas; }
    get statistics() {
        const now = performance.now();
        this.renderTimes = this.renderTimes.filter(time => time > now - 1000);
        return {queuedFrames: this.queue.size, bufferedMs: this.queue.bufferedMs,
            droppedFrames: this.queue.dropped, renderFps: this.renderTimes.length,
            bufferedAheadMs: this.queue.bufferedAheadMs(now), state: this.queue.state,
            rebufferCount: this.queue.rebufferCount, playbackRate: this.queue.playbackRate,
            liveLatencyMs: this.queue.liveLatencyMs, fastCatchUps: this.queue.fastCatchUps};
    }

    private async initialize(): Promise<void> {
        if (this.options.backend === 'webgpu') {
            const signal = this.initialization.signal;
            let timer: ReturnType<typeof setTimeout> | undefined;
            let onAbort: (() => void) | undefined;
            try {
                const aborted = new Promise<never>((_resolve, reject) => {
                    onAbort = () => reject(new Error('WebGPU initialization cancelled or timed out'));
                    signal.addEventListener('abort', onAbort, {once: true});
                    timer = setTimeout(() => this.initialization.abort(), 5000);
                });
                const creating = WebCodecsWebGPURenderer.create(error => this.backendError(error), signal);
                // A late successful initialization after timeout/destroy must release its device.
                void creating.then(backend => {
                    if (signal.aborted || this.destroyed) backend.destroy();
                }, () => {});
                const backend = await Promise.race([creating, aborted]);
                if (this.destroyed || signal.aborted) { backend.destroy(); return; }
                this.attach(backend);
            } catch (error) {
                if (!this.destroyed) this.useWebGL(String(error));
            } finally {
                clearTimeout(timer);
                if (onAbort) signal.removeEventListener('abort', onAbort);
            }
        } else {
            this.useWebGL();
        }
    }

    private attach(backend: VideoFrameRenderer, reason?: string): void {
        this.backend = backend;
        backend.canvas.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#000';
        backend.canvas.dataset.renderBackend = backend.kind;
        this.container.appendChild(backend.canvas);
        this.options.onBackendChanged?.(backend.kind, reason);
        this.schedule();
    }

    private useWebGL(reason?: string): void {
        this.backend?.destroy();
        this.backend = null;
        this.attach(new WebCodecsWebGLRenderer(error => this.backendError(error)), reason);
    }

    private backendError(error: Error): void {
        if (this.destroyed || this.failed) return;
        if (this.backend?.kind === 'webgpu') {
            try { this.useWebGL(error.message); }
            catch (failure) { this.reportError(failure); }
        } else this.reportError(error);
    }

    private reportError(error: unknown): void {
        if (this.destroyed || this.failed) return;
        this.failed = true;
        this.queue.clear();
        cancelAnimationFrame(this.animation);
        this.animation = 0;
        this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
    }

    /** Input is borrowed; retain a clone until its PTS becomes due. */
    render(frame: VideoFrame): void {
        if (this.destroyed || this.failed) return;
        this.queue.push(frame.clone(), performance.now());
        this.reportPresentation();
        this.schedule();
    }

    finish(): void {
        if (this.destroyed || this.failed) return;
        this.queue.finish(performance.now());
        this.reportPresentation();
        this.schedule();
    }

    updateLiveEdge(pts: number): void {
        if (this.destroyed || this.failed) return;
        this.queue.updateLiveEdge(pts, performance.now());
        this.reportPresentation();
        this.schedule();
    }

    reset(): void {
        this.queue.clear();
        this.reportPresentation();
    }

    private reportPresentation(): void {
        this.options.onPresentationState?.({state: this.queue.state, queuedFrames: this.queue.size,
            bufferedAheadMs: this.queue.bufferedAheadMs(performance.now()), presentedPTS: this.queue.presentedPTS,
            discardBeforePTS: this.queue.discardBeforePTS(performance.now())});
    }

    private didRender(): void {
        const now = performance.now();
        // Bound statistics even when the consumer never reads the statistics getter.
        this.renderTimes = this.renderTimes.filter(time => time > now - 1000);
        this.renderTimes.push(now);
        this.options.onRendered?.();
    }

    private schedule(): void {
        if (this.animation || !this.backend || !this.queue.size || this.destroyed || this.failed) return;
        this.animation = requestAnimationFrame(() => {
            this.animation = 0;
            const frame = this.queue.take(performance.now());
            if (!frame) { this.reportPresentation(); this.schedule(); return; }
            try {
                this.backend!.draw(frame);
                this.didRender();
            } catch (error) {
                this.backendError(error instanceof Error ? error : new Error(String(error)));
                if (!this.destroyed && !this.failed) {
                    // Retry directly after backend fallback; this PTS was already consumed.
                    try { this.backend!.draw(frame); this.didRender(); }
                    catch (failure) { this.reportError(failure); }
                }
            } finally { frame.close(); }
            if (!this.destroyed && !this.failed) this.reportPresentation();
            this.schedule();
        });
    }

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.initialization.abort();
        cancelAnimationFrame(this.animation);
        this.animation = 0;
        this.queue.clear();
        this.backend?.destroy();
        this.backend = null;
    }
}
