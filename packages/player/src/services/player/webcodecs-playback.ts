import {createDecodePipeline, DecodePipelineEvents, DecodeStreamEvents} from '@break_happy/streamcanvasx-core';
import type Mpegts from '@break_happy/streamcanvasx-core';
import type {IplayerConfig} from '../../types/services';
import WebCodecsVideoRenderer from '../renderingEngines/webcodecs-video-renderer';

/** Owns the complete video-only WebCodecs session behind the public player API. */
export default class WebCodecsPlayback {
    private pipeline?: Mpegts.DecodePipeline;
    private renderer?: WebCodecsVideoRenderer;
    private closed = false;
    private startedAt = 0;
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
            this.counts.decoded++;
            renderer.render(frame);
        });
        pipeline.on(DecodePipelineEvents.DECODE_COMPLETE, () => {
            if (this.closed) return;
            renderer.finish();
            this.status('视频解码完成（音频暂未播放）。');
            this.emit('webcodecsComplete', this.statistics);
        });
        pipeline.on(DecodePipelineEvents.VIDEO_RESET, () => renderer.reset());
        pipeline.on(DecodePipelineEvents.VIDEO_LIVE_EDGE, ({pts}) => renderer.updateLiveEdge(pts));
        pipeline.on(DecodePipelineEvents.VIDEO_BUFFER_STATS, stats => { this.buffer = stats; });
        pipeline.on(DecodeStreamEvents.ENCODED_SAMPLE, sample => {
            if (sample.type === 'video') this.counts.video++; else this.counts.audio++;
        });
        pipeline.on(DecodeStreamEvents.PCM_DATA, () => this.counts.pcm++);
        pipeline.on(DecodeStreamEvents.ERROR, error => this.fail(new Error(error.msg)));
        pipeline.on(DecodeStreamEvents.LOADING_COMPLETE, () => this.status('编码流读取完成，正在等待视频解码结束。'));
        this.startedAt = performance.now();
        pipeline.start();
        this.status('Worker 视频解码已启动（音频暂未播放）。');
        if (!this.closed) this.emit('webcodecsStarted');
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
        this.pipeline?.destroy();
        this.renderer?.destroy();
    }
}

export type WebCodecsStatistics = WebCodecsPlayback["statistics"];
