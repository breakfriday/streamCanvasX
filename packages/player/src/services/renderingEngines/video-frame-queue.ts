import VideoPresentationClock from './video-presentation-clock';
import {WEBCODECS_LIVE_CONFIG, WEBCODECS_FILE_CONFIG} from '../../constant/webcodecs-config';

export interface TimedFrame { readonly timestamp: number; close(): void; }

export interface VideoFrameQueueOptions {
    live?: boolean;
}

/** Video-only presentation clock. Owns queued frames; timestamps are microseconds. */
export default class VideoFrameQueue<T extends TimedFrame> {
    private frames: T[] = [];
    private clock: VideoPresentationClock;
    private lastInput: number | null = null;
    private lastPresented = -Infinity;
    dropped = 0;

    private delayMs: number;
    private maxFrames: number;
    private maxBufferedMs: number;
    private live: boolean;

    constructor(options: VideoFrameQueueOptions = {}) {
        this.live = options.live === true;
        const config = this.live ? WEBCODECS_LIVE_CONFIG : WEBCODECS_FILE_CONFIG;
        this.delayMs = config.delayMs;
        this.maxFrames = config.maxFrames;
        this.maxBufferedMs = config.maxBufferedMs;
        if (!Number.isFinite(this.delayMs) || this.delayMs < 0 ||
            !Number.isInteger(this.maxFrames) || this.maxFrames < 1 ||
            !Number.isFinite(this.maxBufferedMs) || this.maxBufferedMs < this.delayMs) {
            throw new RangeError('Invalid video frame queue options');
        }
        this.clock = new VideoPresentationClock(this.delayMs, options);
    }

    get size(): number { return this.frames.length; }
    get state() { return this.clock.state; }
    get rebufferCount(): number { return this.clock.rebufferCount; }
    get playbackRate(): number { return this.clock.playbackRate; }
    get fastCatchUps(): number { return this.clock.fastCatchUps; }
    get liveLatencyMs(): number | null {
        return this.clock.liveEdgePTS === null || !Number.isFinite(this.lastPresented) ? null :
            Math.max(0, (this.clock.liveEdgePTS - this.lastPresented) / 1000);
    }
    discardBeforePTS(now: number): number | null { return this.clock.discardBeforePTS(now); }

    updateLiveEdge(pts: number, now: number): void {
        this.clock.updateLiveEdge(pts, now);
        this.discardExpired(now);
    }

    private discardExpired(now: number): void {
        const cutoff = this.discardBeforePTS(now);
        if (cutoff === null) return;
        while (this.frames.length && this.frames[0].timestamp < cutoff) {
            this.frames.shift()!.close(); this.dropped++;
        }
    }
    get presentedPTS(): number | null { return Number.isFinite(this.lastPresented) ? this.lastPresented : null; }
    bufferedAheadMs(now: number): number {
        const pts = this.clock.mediaPTS(now);
        return pts === null || !this.frames.length ? 0 :
            Math.max(0, (this.frames[this.frames.length - 1].timestamp - pts) / 1000);
    }
    get bufferedMs(): number {
        return this.frames.length > 1 ? Math.max(0, (this.frames[this.frames.length - 1].timestamp - this.frames[0].timestamp) / 1000) : 0;
    }

    push(frame: T, now: number): void {
        if (!Number.isFinite(frame.timestamp)) { frame.close(); this.dropped++; return; }
        // Large discontinuities start a fresh video clock, independently of audio.
        if (this.lastInput !== null && (frame.timestamp < this.lastInput - 500000 ||
            (!this.live && frame.timestamp > this.lastInput + 2000000))) {
            this.clear();
        }
        this.lastInput = frame.timestamp;
        if (frame.timestamp <= this.lastPresented) { frame.close(); this.dropped++; return; }
        const previousCutoff = this.discardBeforePTS(now);
        if (previousCutoff !== null && frame.timestamp < previousCutoff) { frame.close(); this.dropped++; return; }
        this.clock.observeInput(frame.timestamp, now, !this.frames.length);
        const cutoff = this.discardBeforePTS(now);
        if (cutoff !== null && frame.timestamp < cutoff) { frame.close(); this.dropped++; return; }
        // Usually output is already in presentation order. Preserve a bounded reorder window.
        let index = this.frames.length;
        while (index > 0 && this.frames[index - 1].timestamp > frame.timestamp) index--;
        if (index > 0 && this.frames[index - 1].timestamp === frame.timestamp) {
            frame.close(); this.dropped++; return;
        }
        this.frames.splice(index, 0, frame);
        if (this.size > this.maxFrames || this.bufferedMs > this.maxBufferedMs) {
            // Catch up only on excessive backlog; retain a short runway, not just one frame.
            while (this.size > 1 && (this.size > this.maxFrames || this.bufferedMs > this.delayMs)) {
                this.frames.shift()!.close(); this.dropped++;
            }
            this.clock.catchUp(this.frames[0].timestamp, now);
        }
    }

    take(now: number): T | null {
        this.clock.advance(now);
        this.discardExpired(now);
        let selected: T | null = null;
        while (this.frames.length && this.clock.due(this.frames[0].timestamp) <= now) {
            if (selected) { selected.close(); this.dropped++; }
            selected = this.frames.shift()!;
        }
        if (selected) this.lastPresented = selected.timestamp;
        return selected;
    }

    finish(now: number): void { this.clock.finish(this.frames[0]?.timestamp, now); }

    clear(): void {
        for (const frame of this.frames) frame.close();
        this.frames = [];
        this.clock.reset();
        this.lastInput = null;
        this.lastPresented = -Infinity;
    }
}
