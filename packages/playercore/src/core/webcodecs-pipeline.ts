import type Mpegts from '../../d.ts/mpegts';
import DecodeStreamController from './decode-stream-controller';
import Events from './decode-stream-events';
import VideoDecodeScheduler, {type PresentationPressure} from '../decode/video-decode-scheduler';

export type PipelineSink = <K extends keyof Mpegts.DecodePipelineEventMap>(
    event: K, data: Mpegts.DecodePipelineEventMap[K]
) => void;

/** One run. Owns stream + decoder; transport and rendering remain outside. */
export default class WebCodecsPipeline {
    private stream: DecodeStreamController;
    private video: VideoDecodeScheduler | null = null;
    private closed = false;
    private videoConfig: Mpegts.EncodedVideoConfig | null = null;
    private statsAt = -Infinity;
    private live: boolean;
    private lastVideoDTS: number | null = null;
    private liveEdge: number | null = null;
    private edgeScheduledFor: VideoDecodeScheduler | null = null;

    constructor(source: Mpegts.MediaDataSource, config: Mpegts.DecodePipelineConfig, private emit: PipelineSink,
        private pressure: () => PresentationPressure | null = () => null) {
        this.live = source.isLive === true;
        this.stream = new DecodeStreamController(source, config);
        this.stream.on(Events.TRACK_CONFIG, metadata => {
            try {
                if (metadata.type === 'video') {
                    this.videoConfig = metadata;
                    this.video ??= this.createVideo();
                    this.video.configure(metadata);
                }
                if (!this.closed) this.emit('track_config', metadata);
            } catch (error) { this.fail(error); }
        });
        this.stream.on(Events.ENCODED_SAMPLE, sample => {
            if (sample.type === 'video') {
                if (this.live && this.lastVideoDTS !== null && sample.dts < this.lastVideoDTS - 500000) {
                    this.resetVideo('video-timestamp-reset');
                }
                this.lastVideoDTS = sample.dts;
                this.video?.decode(sample);
                if (this.live && Number.isFinite(sample.pts)) {
                    this.liveEdge = Math.max(this.liveEdge ?? sample.pts, sample.pts);
                    this.scheduleLiveEdge();
                }
            }
            // Debugging is opt-in: avoid transferring every encoded packet in production.
            // Decoder retains the original until async configuration/submission completes.
            if (config.emitEncodedSamples && !this.closed) {
                this.emit('encoded_sample', {...sample, data: new Uint8Array(sample.data)});
            }
        });
        this.stream.on(Events.ERROR, error => {
            if (this.closed) return;
            this.destroy();
            this.emit('error', error);
        });
        this.stream.on(Events.LOADING_COMPLETE, () => {
            this.emit('loading_complete', undefined);
            void this.finish();
        });
        this.stream.on(Events.DISCONTINUITY, data => {
            if (this.closed) return;
            this.resetVideo(data.reason);
            this.emit(Events.DISCONTINUITY, data);
        });
        for (const event of [Events.PCM_DATA, Events.MEDIA_INFO, Events.METADATA_ARRIVED,
            Events.SCRIPTDATA_ARRIVED, Events.STATISTICS_INFO,
            Events.RECOVERED_EARLY_EOF] as const) {
            this.stream.on(event, data => this.emit(event, data));
        }
    }

    start(): void { this.stream.start(); }

    presentationChanged(): void { this.video?.notify(); }

    private resetVideo(reason: string): void {
        this.video?.destroy();
        this.video = null;
        this.lastVideoDTS = null;
        this.liveEdge = null;
        this.edgeScheduledFor = null;
        this.emit('video_reset', {reason});
        if (this.videoConfig) {
            this.video = this.createVideo();
            this.video.configure(this.videoConfig);
        }
    }

    private scheduleLiveEdge(): void {
        const video = this.video;
        if (!video || this.edgeScheduledFor === video) return;
        this.edgeScheduledFor = video;
        queueMicrotask(() => {
            if (this.closed || this.video !== video || this.edgeScheduledFor !== video) return;
            this.edgeScheduledFor = null;
            if (this.liveEdge !== null) this.emit('video_live_edge', {pts: this.liveEdge});
        });
    }

    private createVideo(): VideoDecodeScheduler {
        return new VideoDecodeScheduler({
            onFrame: frame => this.closed ? frame.close() : this.emit('video_frame', frame),
            onError: error => this.fail(error)
        }, this.pressure, stats => {
            const now = performance.now();
            if (!this.closed && now - this.statsAt >= 250) {
                this.statsAt = now;
                this.emit('video_buffer_stats', stats);
            }
        }, this.live, reason => {
            if (this.closed) return;
            this.emit('video_reset', {reason});
            // The renderer lost its clock; republish the received edge in the new generation.
            if (this.liveEdge !== null) this.emit('video_live_edge', {pts: this.liveEdge});
        });
    }

    private async finish(): Promise<void> {
        try {
            const video = this.video;
            await video?.finish();
            if (this.closed || video !== this.video) return;
            if (video) this.emit('video_buffer_stats', video.statistics);
            this.destroy();
            this.emit('decode_complete', undefined);
        } catch (error) { this.fail(error); }
    }

    private fail(error: unknown): void {
        if (this.closed) return;
        this.destroy();
        this.emit('error', {type: 'decode', detail: 'VIDEO_DECODE_ERROR', msg: String(error)});
    }

    destroy(): void {
        if (this.closed) return;
        this.closed = true;
        this.video?.destroy();
        this.stream.destroy();
    }
}
