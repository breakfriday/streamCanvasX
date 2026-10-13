export type VideoPresentationPhase = 'buffering' | 'playing' | 'rebuffering' | 'ended';

export interface LiveClockOptions {
    live?: boolean;
    targetLatencyMs?: number;
    maxLatencyMs?: number;
    maxPlaybackRate?: number;
}

/** Video-only media clock. Times passed by the renderer are local monotonic milliseconds. */
export default class VideoPresentationClock {
    private anchorPTS: number | null = null;
    private anchorWall = 0;
    private lateSince: number | null = null;
    private phase: VideoPresentationPhase = 'buffering';
    private liveEdge: number | null = null;
    private edgeAt = -Infinity;
    private rate = 1;
    private filteredLag: number | null = null;
    private discardFloor = -Infinity;
    private targetLatencyMs: number;
    private maxLatencyMs: number;
    private maxPlaybackRate: number;
    rebufferCount = 0;
    fastCatchUps = 0;

    constructor(private delayMs = 100, private options: LiveClockOptions = {}) {
        this.targetLatencyMs = options.targetLatencyMs ?? 150;
        this.maxLatencyMs = options.maxLatencyMs ?? 700;
        this.maxPlaybackRate = options.maxPlaybackRate ?? 1.25;
        if (!Number.isFinite(this.targetLatencyMs) || this.targetLatencyMs < 0 ||
            !Number.isFinite(this.maxLatencyMs) || this.maxLatencyMs <= this.targetLatencyMs ||
            !Number.isFinite(this.maxPlaybackRate) || this.maxPlaybackRate < 1 || this.maxPlaybackRate > 2) {
            throw new RangeError('Invalid live video clock options');
        }
    }

    get state(): VideoPresentationPhase { return this.phase; }
    get playbackRate(): number { return this.rate; }
    get liveEdgePTS(): number | null { return this.liveEdge; }

    updateLiveEdge(pts: number, now: number): void {
        if (!this.options.live || !Number.isFinite(pts) || this.phase === 'ended') return;
        this.liveEdge = this.liveEdge === null ? pts : Math.max(pts, this.liveEdge);
        this.edgeAt = now;
        this.advance(now);
        this.enforceLatency(now);
    }

    private enforceLatency(now: number): void {
        const media = this.mediaPTS(now);
        if (!this.options.live || this.liveEdge === null || media === null || this.phase === 'ended') return;
        if (this.liveEdge - media > this.maxLatencyMs * 1000) {
            this.catchUp(this.liveEdge - this.targetLatencyMs * 1000, now);
            this.fastCatchUps++;
        }
    }

    /** Safe to discard OUTPUT below this PTS; compressed reference pictures still decode. */
    discardBeforePTS(now: number): number | null {
        if (!this.options.live) return null;
        const media = this.mediaPTS(now);
        // Never expire the newest received pictures merely because the wall clock ran
        // ahead during a network stall. They are needed to restart presentation.
        const deadline = this.phase === 'playing' && media !== null && this.liveEdge !== null ?
            Math.min(media - 150000, this.liveEdge - this.targetLatencyMs * 1000) : -Infinity;
        const cutoff = Math.max(this.discardFloor, deadline);
        return Number.isFinite(cutoff) ? cutoff : null;
    }

    observeInput(pts: number, now: number, empty: boolean): void {
        this.advance(now);
        if (this.anchorPTS === null) {
            this.buffer(pts, now, false);
            this.enforceLatency(now);
            return;
        }
        if (this.phase !== 'playing') return;
        // One empty queue or a slightly late rAF is normal. Only sustained lateness,
        // or a clear starvation gap, starts a new buffering interval.
        const late = now - this.due(pts);
        if (empty && late > 20) {
            this.lateSince ??= now;
            if (late > 150 || now - this.lateSince >= 100) this.buffer(pts, now, true);
        } else this.lateSince = null;
    }

    private buffer(pts: number, now: number, rebuffer: boolean): void {
        this.anchorPTS = pts;
        this.anchorWall = now + this.delayMs;
        this.lateSince = null;
        this.phase = rebuffer ? 'rebuffering' : 'buffering';
        this.rate = 1;
        this.filteredLag = null;
        if (rebuffer) this.rebufferCount++;
    }

    advance(now: number): void {
        if ((this.phase === 'buffering' || this.phase === 'rebuffering') &&
            this.anchorPTS !== null && now >= this.anchorWall) this.phase = 'playing';
        if (this.anchorPTS === null || now <= this.anchorWall ||
            (this.phase !== 'playing' && this.phase !== 'ended')) return;
        const elapsed = now - this.anchorWall;
        // Re-anchor BEFORE changing rate, so changing speed never jumps the media clock.
        this.anchorPTS += elapsed * this.rate * 1000;
        this.anchorWall = now;
        if (!this.options.live || this.phase === 'ended') { this.rate = 1; return; }
        if (this.liveEdge === null || now - this.edgeAt > 1000) {
            this.rate = 1; this.filteredLag = null; return;
        }
        const lag = Math.max(0, (this.liveEdge - this.anchorPTS) / 1000);
        const alpha = 1 - Math.exp(-elapsed / 250);
        this.filteredLag = this.filteredLag === null ? lag : this.filteredLag + alpha * (lag - this.filteredLag);
        const excess = this.filteredLag - this.targetLatencyMs;
        const desired = excess > 40 ? Math.min(this.maxPlaybackRate, 1 + (excess - 40) / 800) :
            excess < -60 ? 0.98 : 1;
        const step = elapsed / 1000 * 0.5;
        this.rate += Math.max(-step, Math.min(step, desired - this.rate));
    }

    due(pts: number): number {
        return this.anchorPTS === null ? Infinity : this.anchorWall + (pts - this.anchorPTS) / (1000 * this.rate);
    }

    mediaPTS(now: number): number | null {
        if (this.anchorPTS === null) return null;
        // Before startup/resume, report actual retained media rather than counting
        // the intentional wall-clock wait as extra buffered content.
        return this.anchorPTS + Math.max(0, now - this.anchorWall) * 1000 * this.rate;
    }

    catchUp(pts: number, now: number): void {
        this.anchorPTS = pts;
        this.anchorWall = now;
        this.lateSince = null;
        this.rate = 1;
        this.filteredLag = null;
        if (this.options.live) this.discardFloor = Math.max(this.discardFloor, pts);
        if (this.phase !== 'ended') this.phase = 'playing';
    }

    finish(firstPTS: number | undefined, now: number): void {
        if (firstPTS !== undefined && (this.phase === 'buffering' || this.phase === 'rebuffering')) {
            this.catchUp(firstPTS, now);
        }
        this.phase = 'ended';
        this.advance(now);
        this.rate = 1;
    }

    reset(): void {
        this.anchorPTS = null;
        this.anchorWall = 0;
        this.lateSince = null;
        this.phase = 'buffering';
        this.liveEdge = null;
        this.edgeAt = -Infinity;
        this.rate = 1;
        this.filteredLag = null;
        this.discardFloor = -Infinity;
    }
}
