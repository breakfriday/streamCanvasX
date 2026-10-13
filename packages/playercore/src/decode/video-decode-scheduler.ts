import type Mpegts from '../../d.ts/mpegts';
import EncodedVideoQueue, {EncodedVideoQueueOverflow, type VideoDecodeCommand} from './encoded-video-queue';
import {isSafeVideoRestart} from './video-random-access';
import WebCodecsVideoDecoder from './video-decoder';
import type {VideoConfig, VideoSample, VideoDecoderCallbacks} from './decoder-types';

export interface PresentationPressure {
    /** All output frames: transport staging + unreported deliveries + main-thread queue. */
    retainedFrames: number;
    bufferedAheadMs: number;
    presentedPTS?: number | null;
    discardBeforePTS?: number | null;
}

/** Bounded input + demand-driven decode, with live-only safe GOP recovery. */
export default class VideoDecodeScheduler {
    private queue = new EncodedVideoQueue();
    private decoder: WebCodecsVideoDecoder;
    private closed = false;
    private pumping = false;
    private ended = false;
    private flushing = false;
    private outstanding = 0;
    private configId = 0;
    private needsKey = true;
    private outputTimer: ReturnType<typeof setTimeout> | null = null;
    private finishResolve: (() => void) | null = null;
    private finishPromise: Promise<void> | null = null;
    private liveEdge: number | null = null;
    private discardBefore = -Infinity;
    private discardedFrames = 0;

    private epoch = 0;
    private latestConfig: VideoConfig | null = null;
    private waitingForKeyframe = false;
    private skippedSamples = 0;
    private keyframeJumps = 0;
    private lastJumpAt = -Infinity;

    constructor(private callbacks: VideoDecoderCallbacks,
        private pressure: () => PresentationPressure | null,
        private changed: (stats: Mpegts.VideoBufferStatistics) => void = () => {},
        private live = false,
        private onReset: (reason: string) => void = () => {}) {
        this.decoder = this.createDecoder();
    }

    private createDecoder(): WebCodecsVideoDecoder {
        const epoch = this.epoch;
        return new WebCodecsVideoDecoder({
            onFrame: frame => {
                if (this.closed || epoch !== this.epoch) { frame.close(); return; }
                this.clearOutputTimer();
                this.outstanding = Math.max(0, this.outstanding - 1);
                this.updateDeadline();
                if (this.live && frame.timestamp < this.discardBefore) {
                    frame.close(); this.discardedFrames++;
                } else this.callbacks.onFrame(frame);
                this.notify();
            },
            onError: error => { if (epoch === this.epoch) this.fail(error); },
            onDequeue: () => { if (epoch === this.epoch) this.notify(); }
        });
    }

    get statistics(): Mpegts.VideoBufferStatistics {
        return {encodedFrames: this.queue.sampleCount, encodedBytes: this.queue.byteLength,
            encodedBufferedMs: this.queue.bufferedMs, decodeQueueSize: this.decoder.decodeQueueSize,
            pendingDecodeFrames: this.outstanding, retainedVideoFrames: this.pressure()?.retainedFrames ?? 0,
            transportDroppedFrames: 0, decodeDiscardedFrames: this.discardedFrames, liveEdgePTS: this.liveEdge,
            encodedSkippedFrames: this.skippedSamples, keyframeJumps: this.keyframeJumps,
            waitingForKeyframe: this.waitingForKeyframe};
    }

    configure(config: VideoConfig): void {
        if (this.closed || this.ended) return;
        this.latestConfig = config;
        if (!this.waitingForKeyframe) this.enqueue({kind: 'config', config});
    }
    decode(sample: VideoSample): void {
        if (this.closed || this.ended) return;
        if (!Number.isFinite(sample.dts) || !Number.isFinite(sample.pts)) {
            this.fail(new Error('Invalid encoded video timestamp')); return;
        }
        this.liveEdge = Math.max(this.liveEdge ?? sample.pts, sample.pts);
        if (this.waitingForKeyframe) {
            this.resumeAtKeyframe(sample);
            this.notify();
        } else this.enqueue({kind: 'sample', sample});
    }

    private updateDeadline(): void {
        if (!this.live) return;
        const pressure = this.pressure();
        if (pressure?.discardBeforePTS != null) this.discardBefore = Math.max(this.discardBefore, pressure.discardBeforePTS);
        // A frozen/slow consumer must not turn the coded queue into seconds of latency.
        // Decode dependencies at full speed, closing obsolete OUTPUT instead of waiting
        // for display credits. Native submission and look-ahead remain bounded.
        if (this.liveEdge !== null && (this.queue.bufferedMs > 700 ||
            (pressure?.presentedPTS != null && this.liveEdge - pressure.presentedPTS > 700000))) {
            this.discardBefore = Math.max(this.discardBefore, this.liveEdge - 150000);
        }
    }

    private enqueue(entry: VideoDecodeCommand): void {
        if (this.closed || this.ended) return;
        try { this.queue.push(entry); this.notify(); }
        catch (error) {
            if (!this.live || !(error instanceof EncodedVideoQueueOverflow)) { this.fail(error); return; }
            // Limits remain hard bounds. A failed push never retains the incoming packet.
            const dropped = this.queue.skipToLatestKeyframe();
            if (dropped) {
                this.skippedSamples += dropped;
                try {
                    this.queue.push(entry);
                    this.restartDecoder('live-keyframe-catchup');
                    this.notify(); return;
                }
                catch (retryError) {
                    if (!(retryError instanceof EncodedVideoQueueOverflow)) { this.fail(retryError); return; }
                }
            }
            this.skippedSamples += this.queue.sampleCount;
            this.queue.clear();
            this.waitingForKeyframe = true;
            this.restartDecoder('live-waiting-for-keyframe');
            if (entry.kind === 'sample') this.resumeAtKeyframe(entry.sample);
            this.notify();
        }
    }

    private resumeAtKeyframe(sample: VideoSample): void {
        const config = this.latestConfig;
        if (!config || !isSafeVideoRestart(sample, config)) { this.skippedSamples++; return; }
        try {
            this.queue.push({kind: 'config', config});
            this.queue.push({kind: 'sample', sample});
            this.waitingForKeyframe = false;
        } catch (error) {
            this.queue.clear();
            if (error instanceof EncodedVideoQueueOverflow) this.skippedSamples++;
            else this.fail(error);
        }
    }

    private restartDecoder(reason: string): void {
        // Invalidate callbacks and async configure/decode continuations BEFORE closing.
        this.epoch++;
        this.decoder.destroy();
        this.clearOutputTimer();
        this.outstanding = 0;
        this.configId = 0;
        this.needsKey = true;
        this.pumping = false;
        this.flushing = false;
        this.discardBefore = -Infinity;
        this.lastJumpAt = performance.now();
        this.keyframeJumps++;
        this.decoder = this.createDecoder();
        this.onReset(reason);
    }

    /** Called after output, presentation feedback, and new input. */
    notify(): void {
        if (this.closed) return;
        // Soft recovery is throttled; hard-limit recovery above must never wait.
        if (this.live && this.queue.bufferedMs > 1500 && performance.now() - this.lastJumpAt >= 1000) {
            const dropped = this.queue.skipToLatestKeyframe();
            if (dropped) {
                this.skippedSamples += dropped;
                this.restartDecoder('live-keyframe-catchup');
            }
        }
        this.updateDeadline();
        this.changed(this.statistics);
        if (!this.pumping) void this.pump();
    }

    private canSubmit(): boolean {
        const pressure = this.pressure();
        // With no visible output, allow codec look-ahead even when requests have left
        // decodeQueueSize. Some codecs emit only after receiving subsequent inputs.
        if (this.outstanding >= 32) {
            // decodeQueueSize can reach zero before the output callback task runs.
            // Wait for that task; only sustained absence of progress is an error.
            if ((!pressure || pressure.retainedFrames === 0) && this.outputTimer === null) {
                this.outputTimer = setTimeout(() => this.fail(new Error(
                    'Video decoder made no output within the bounded look-ahead window')), 2000);
            }
            return false;
        }
        if (!pressure) return true; // Synchronous frame consumers need no presentation feedback.
        const next = this.queue.peek();
        if (this.live && next?.kind === 'sample' && next.sample.pts < this.discardBefore) return true;
        if (pressure.retainedFrames === 0) return true;
        // Shared output budget; leave a reserve for asynchronous codec output.
        return pressure.retainedFrames + this.outstanding < 12 &&
            (pressure.bufferedAheadMs < 150 || pressure.retainedFrames < 3);
    }

    private async pump(): Promise<void> {
        this.pumping = true;
        const epoch = this.epoch;
        const decoder = this.decoder;
        try {
            while (!this.closed && epoch === this.epoch && this.queue.size) {
                const next = this.queue.peek()!;
                if (next.kind === 'sample' && !this.canSubmit()) break;
                this.queue.shift();
                if (next.kind === 'config') {
                    await decoder.configure(next.config);
                    if (this.closed || epoch !== this.epoch) return;
                    this.outstanding = 0; // The previous configuration has been flushed.
                    this.configId = next.config.configId;
                    this.needsKey = true;
                } else {
                    const sample = next.sample;
                    if (sample.configId !== this.configId) throw new Error('Video sample/configuration mismatch');
                    if (this.needsKey && !sample.isKeyframe) continue;
                    this.needsKey = false;
                    this.outstanding++;
                    await decoder.decode(sample);
                }
            }
            if (!this.closed && epoch === this.epoch && this.ended && !this.queue.size && !this.flushing) {
                this.flushing = true;
                await decoder.finish();
                if (this.closed || epoch !== this.epoch) return;
                this.outstanding = 0;
                this.finishResolve?.();
            }
        } catch (error) { if (epoch === this.epoch) this.fail(error); }
        finally {
            if (epoch === this.epoch) {
                this.pumping = false;
                if (!this.closed) this.changed(this.statistics);
            }
        }
    }

    finish(): Promise<void> {
        if (this.closed) return Promise.resolve();
        if (!this.finishPromise) {
            this.ended = true;
            this.finishPromise = new Promise(resolve => { this.finishResolve = resolve; });
            this.notify();
        }
        return this.finishPromise;
    }

    private fail(error: unknown): void {
        if (this.closed) return;
        this.destroy();
        this.callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }

    private clearOutputTimer(): void {
        if (this.outputTimer !== null) clearTimeout(this.outputTimer);
        this.outputTimer = null;
    }

    destroy(): void {
        if (this.closed) return;
        this.closed = true;
        this.clearOutputTimer();
        this.queue.clear();
        this.decoder.destroy();
        this.finishResolve?.();
    }
}
