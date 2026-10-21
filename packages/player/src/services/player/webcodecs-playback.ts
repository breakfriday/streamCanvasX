import {createDecodePipeline, DecodePipelineEvents, DecodeStreamEvents} from '@break_happy/streamcanvasx-core';
import type Mpegts from '@break_happy/streamcanvasx-core';
import type {IplayerConfig} from '../../types/services';
import WebCodecsVideoRenderer from '../renderingEngines/webcodecs-video-renderer';

/** Owns the complete video-only WebCodecs session behind the public player API. */
class WebCodecsSession {
    private pipeline?: Mpegts.DecodePipeline;
    private renderer?: WebCodecsVideoRenderer;
    private closed = false;
    private startedAt = 0;
    private lastDataAt = 0;
    private stallTimer?: ReturnType<typeof setInterval>;
    private drainTimer?: ReturnType<typeof setInterval>;
    private firstFrameMs?: number;
    private counts = {video: 0, audio: 0, pcm: 0, decoded: 0, rendered: 0};
    private buffer?: Mpegts.VideoBufferStatistics;

    constructor(private config: IplayerConfig, private emit: (event: string, data?: any) => void) {}

    get statistics() {
        return {counts: {...this.counts}, firstFrameMs: this.firstFrameMs,
            rendering: this.renderer?.statistics, buffer: this.buffer ? {...this.buffer} : undefined};
    }

    start(): void { void this.initialize().catch(error => this.fail(error)); }

    private status(message: string): void { if (!this.closed) this.emit('webcodecsStatus', message); }

    private async initialize(): Promise<void> {
        const {url, contentEl, streamType = 'flv', isLive = true, videoRenderBackend = 'webgl'} = this.config;
        if (!url || !contentEl) throw new Error('WebCodecs requires url and contentEl');
        if (streamType.toLowerCase() !== 'flv' || this.config.fileData) throw new Error('WebCodecs currently supports FLV URLs only');
        if (videoRenderBackend !== 'webgl' && videoRenderBackend !== 'webgpu') throw new Error('Invalid videoRenderBackend');
        const pipeline = this.pipeline = createDecodePipeline({type: 'flv', url, isLive}, {
            webcodec: true, enableStashBuffer: false, presentationFeedback: true,
            emitEncodedSamples: this.config.webcodecsDebug === true,
        });
        this.status('正在初始化视频渲染器…');
        const renderer = this.renderer = new WebCodecsVideoRenderer(contentEl, {
            backend: videoRenderBackend, live: isLive,
            onPresentationState: state => { if (!this.closed) pipeline.updatePresentationState(state); },
            onRendered: () => {
                if (this.closed) return;
                this.firstFrameMs ??= performance.now() - this.startedAt;
                this.counts.rendered++;
            },
            onBackendChanged: (backend, reason) => { if (!this.closed) this.emit('webcodecsRender', {backend, reason}); },
            onError: error => this.fail(error),
        });
        await renderer.ready;
        if (this.closed) { renderer.destroy(); return; }
        pipeline.on(DecodePipelineEvents.VIDEO_FRAME, frame => {
            if (this.closed) return;
            this.lastDataAt = performance.now();
            this.counts.decoded++;
            renderer.render(frame);
        });
        pipeline.on(DecodePipelineEvents.DECODE_COMPLETE, () => {
            if (this.closed) return;
            renderer.finish();
            this.status('视频解码完成（音频暂未播放）。');
            this.emit('webcodecsComplete', this.statistics);
            if (isLive && !this.closed) this.drainTimer = setInterval(() => {
                // Preserve already decoded output before replacing the ended live session.
                if (renderer.statistics.queuedFrames === 0) this.disconnected('视频解码完成，直播连接已结束');
            }, 50);
        });
        pipeline.on(DecodePipelineEvents.VIDEO_RESET, () => renderer.reset());
        pipeline.on(DecodePipelineEvents.VIDEO_LIVE_EDGE, ({pts}) => {
            this.lastDataAt = performance.now();
            renderer.updateLiveEdge(pts);
        });
        pipeline.on(DecodePipelineEvents.VIDEO_BUFFER_STATS, stats => { this.buffer = stats; });
        pipeline.on(DecodeStreamEvents.ENCODED_SAMPLE, sample => {
            if (sample.type === 'video') this.counts.video++; else this.counts.audio++;
        });
        pipeline.on(DecodeStreamEvents.PCM_DATA, () => this.counts.pcm++);
        pipeline.on(DecodeStreamEvents.ERROR, error => {
            if (isLive && error.type === 'network') this.disconnected(error.msg);
            else this.fail(new Error(error.msg));
        });
        pipeline.on(DecodeStreamEvents.LOADING_COMPLETE, () => this.status('编码流读取完成，正在等待视频解码结束。'));
        this.startedAt = this.lastDataAt = performance.now();
        if (isLive) this.stallTimer = setInterval(() => {
            if (!this.closed && performance.now() - this.lastDataAt >= 15000) this.disconnected('15 秒未收到视频数据');
        }, 1000);
        pipeline.start();
        this.status('Worker 视频解码已启动（音频暂未播放）。');
        if (!this.closed) this.emit('webcodecsStarted');
    }

    private disconnected(reason: string): void {
        if (this.closed) return;
        this.destroy();
        this.emit('disconnected', reason);
    }

    private fail(error: unknown): void {
        if (this.closed) return;
        const failure = error instanceof Error ? error : new Error(String(error));
        this.destroy();
        this.emit('webcodecsStatus', `编码流调试失败：${failure.message}`);
        this.emit('webcodecsError', failure);
    }

    destroy(): void {
        if (this.closed) return;
        this.closed = true;
        clearInterval(this.stallTimer);
        clearInterval(this.drainTimer);
        this.pipeline?.destroy();
        this.renderer?.destroy();
    }
}

/** Reconnect only live transport failures; manual destroy invalidates every pending retry. */
export default class WebCodecsPlayback {
    private session?: WebCodecsSession;
    private closed = false;
    private retryTimer?: ReturnType<typeof setTimeout>;
    private failures = 0;

    constructor(private config: IplayerConfig, private emit: (event: string, data?: any) => void) {}

    get statistics() { return this.session?.statistics; }

    start(): void {
        if (this.closed) return;
        const session = new WebCodecsSession(this.config, (event, data) => {
            if (this.closed || this.session !== session) return;
            if (event === 'disconnected') {
                if (session.statistics.counts.rendered > 0) this.failures = 0;
                void this.reconnect(session, String(data));
            } else this.emit(event, data);
        });
        this.session = session;
        session.start();
    }

    private async reconnect(session: WebCodecsSession, reason: string): Promise<void> {
        try {
            const decision = await this.config.stopCallBack?.();
            if (this.closed || this.session !== session) return;
            if (decision?.stop) {
                this.destroy();
                this.emit('webcodecsStatus', decision.message || '直播重连已停止。');
                return;
            }
        } catch (error) {
            if (this.closed || this.session !== session) return;
            this.destroy();
            this.emit('webcodecsError', error instanceof Error ? error : new Error(String(error)));
            return;
        }
        const attempt = ++this.failures;
        const delayMs = Math.min(2000 * 2 ** Math.min(attempt - 1, 4), 30000);
        this.emit('webcodecsStatus', `${reason}；${delayMs / 1000} 秒后自动重连（第 ${attempt} 次）。`);
        this.emit('webcodecsReconnect', {attempt, delayMs, reason});
        if (this.closed || this.session !== session) return;
        this.retryTimer = setTimeout(() => {
            this.retryTimer = undefined;
            if (!this.closed && this.session === session) this.start();
        }, delayMs);
    }

    destroy(): void {
        if (this.closed) return;
        this.closed = true;
        clearTimeout(this.retryTimer);
        this.session?.destroy();
    }
}

export type WebCodecsStatistics = WebCodecsSession["statistics"];
