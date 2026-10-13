import {test, expect} from '@playwright/test';

test.beforeEach(async ({page}) => { await page.goto('/'); });

test('six-frame network bursts retain 30 fps PTS cadence instead of collapsing to one frame', async ({page}) => {
    const result = await page.evaluate(async () => {
        const {default: Queue} = await import('/packages/player/src/services/renderingEngines/video-frame-queue.ts');
        const queue = new Queue();
        const displayed = [], closed = [];
        for (let burst = 0; burst < 10; burst++) {
            const now = burst * 200;
            for (let i = 0; i < 6; i++) {
                const index = burst * 6 + i;
                queue.push({timestamp: index * 1000000 / 30, close: () => closed.push(index)}, now);
            }
            for (let time = now; time < now + 200; time += 1000 / 60) {
                const frame = queue.take(time);
                if (frame) { displayed.push(frame.timestamp); frame.close(); }
            }
        }
        for (let time = 2000; time < 2200; time += 1000 / 60) {
            const frame = queue.take(time);
            if (frame) { displayed.push(frame.timestamp); frame.close(); }
        }
        return {displayed: displayed.length, closed: closed.length, dropped: queue.dropped, remaining: queue.size};
    });
    expect(result).toEqual({displayed: 60, closed: 60, dropped: 0, remaining: 0});
});

test('presentation clock handles underflow, backlog and timestamp reset without unbounded frames', async ({page}) => {
    const result = await page.evaluate(async () => {
        const {default: Queue} = await import('/packages/player/src/services/renderingEngines/video-frame-queue.ts');
        const queue = new Queue();
        let closed = 0;
        const push = (pts, now) => queue.push({timestamp: pts, close: () => closed++}, now);
        push(1000000, 0);
        const early = queue.take(99);
        queue.take(100)?.close();
        push(1033333, 800); // Long network starvation: restart a small prebuffer.
        const underflowEarly = queue.take(899);
        queue.take(900)?.close();
        for (let i = 0; i < 60; i++) push(1066666 + i * 33333, 1000);
        const bounded = queue.size <= 16 && queue.bufferedMs <= 400;
        push(0, 1100); // New timestamp epoch.
        const resetFrame = queue.take(1200);
        const resetPTS = resetFrame?.timestamp;
        resetFrame?.close();
        queue.clear();
        return {early, underflowEarly, bounded, resetPTS, closed, remaining: queue.size};
    });
    expect(result).toEqual({early: null, underflowEarly: null, bounded: true, resetPTS: 0, closed: 63, remaining: 0});
});

test('sustained mild lateness restores buffering without repeatedly resetting on normal empty queues', async ({page}) => {
    const result = await page.evaluate(async () => {
        const {default: Queue} = await import('/packages/player/src/services/renderingEngines/video-frame-queue.ts');
        function simulate(offset) {
            const queue = new Queue();
            let closed = 0, rendered = 0, largest = 0;
            const push = (pts, now) => queue.push({timestamp: pts, close: () => closed++}, now);
            push(0, 0);
            queue.take(100)?.close();
            let next = 1;
            for (let now = 101; now <= 2200; now++) {
                while (next <= 60 && next * 1000 / 30 + offset <= now) {
                    push(next * 1000000 / 30, now); next++;
                }
                if (now % 16 === 0) {
                    const frame = queue.take(now);
                    if (frame) { rendered++; frame.close(); }
                }
                largest = Math.max(largest, queue.size);
            }
            queue.finish(2200);
            for (let now = 2200; now < 2500; now += 16) queue.take(now)?.close();
            const rebuffers = queue.rebufferCount;
            queue.clear();
            return {rebuffers, largest, closed, rendered};
        }
        return {late: simulate(150), normal: simulate(101)};
    });
    expect(result.late.rebuffers).toBe(1);
    expect(result.late.largest).toBeGreaterThanOrEqual(3);
    expect(result.late.closed).toBe(61);
    expect(result.late.rendered).toBeGreaterThan(50);
    expect(result.normal.rebuffers).toBe(0);
    expect(result.normal.closed).toBe(61);
});

test('EOF drains a short initial buffer, duplicates close once, and invalid options are rejected', async ({page}) => {
    const result = await page.evaluate(async () => {
        const {default: Queue} = await import('/packages/player/src/services/renderingEngines/video-frame-queue.ts');
        const queue = new Queue();
        const closed = [0, 0];
        queue.push({timestamp: 1000, close: () => closed[0]++}, 0);
        queue.push({timestamp: 1000, close: () => closed[1]++}, 1);
        const before = queue.take(2);
        queue.finish(3);
        const tail = queue.take(3);
        tail?.close(); queue.clear();
        const invalid = [{delayMs: -1}, {maxFrames: 0}, {maxFrames: 1.5}, {maxBufferedMs: NaN}]
            .map(options => { try { new Queue(options); return false; } catch { return true; } });
        return {before, timestamp: tail?.timestamp, closed, dropped: queue.dropped, invalid};
    });
    expect(result).toEqual({before: null, timestamp: 1000, closed: [1, 1], dropped: 1,
        invalid: [true, true, true, true]});
});

test('presentation clock does not change its rate with display refresh frequency', async ({page}) => {
    const result = await page.evaluate(async () => {
        const {default: Queue} = await import('/packages/player/src/services/renderingEngines/video-frame-queue.ts');
        return [60, 120, 144].map(hz => {
            const queue = new Queue();
            const displayed = [];
            let next = 0;
            for (let tick = 0; tick < hz * 3; tick++) {
                const now = tick * 1000 / hz;
                while (next < 60 && next * 1000 / 30 <= now) {
                    queue.push({timestamp: next++ * 1000000 / 30, close() {}}, now);
                }
                const frame = queue.take(now);
                if (frame) { displayed.push(frame.timestamp); frame.close(); }
            }
            queue.clear();
            return {displayed, rebuffers: queue.rebufferCount, dropped: queue.dropped};
        });
    });
    for (const value of result) {
        expect(value.displayed).toHaveLength(60);
        expect(value.rebuffers).toBe(0);
        expect(value.dropped).toBe(0);
    }
    expect(result[0].displayed).toEqual(result[1].displayed);
    expect(result[1].displayed).toEqual(result[2].displayed);
});

test('live clock smoothly removes moderate lag with refresh-independent speed and no timeline jumps', async ({page}) => {
    const result = await page.evaluate(async () => {
        const {default: Clock} = await import('/packages/player/src/services/renderingEngines/video-presentation-clock.ts');
        return [60, 120, 144].map(hz => {
            const clock = new Clock(0, {live: true});
            clock.observeInput(0, 0, true);
            let peakRate = 1, previousPTS = 0, largestStep = 0;
            for (let tick = 0; tick <= hz * 10; tick++) {
                const now = tick * 1000 / hz;
                clock.updateLiveEdge(now * 1000 + 400000, now);
                clock.advance(now);
                const pts = clock.mediaPTS(now);
                largestStep = Math.max(largestStep, (pts - previousPTS) / 1000);
                previousPTS = pts;
                peakRate = Math.max(peakRate, clock.playbackRate);
            }
            const lag = (10400000 - clock.mediaPTS(10000)) / 1000;
            const rate = clock.playbackRate;
            clock.advance(12000); // No new input: do not keep accelerating against a stale edge.
            return {hz, peakRate, rate, lag, largestStep, jumps: clock.fastCatchUps, staleRate: clock.playbackRate};
        });
    });
    for (const value of result) {
        expect(value.peakRate).toBeGreaterThan(1.15);
        expect(value.peakRate).toBeLessThanOrEqual(1.25);
        expect(value.lag).toBeLessThan(230);
        expect(value.lag).toBeGreaterThan(120);
        expect(value.rate).toBeLessThan(1.02);
        expect(value.largestStep).toBeLessThanOrEqual(1250 / value.hz + 0.01);
        expect(value.jumps).toBe(0);
        expect(value.staleRate).toBe(1);
    }
    expect(Math.max(...result.map(v => v.lag)) - Math.min(...result.map(v => v.lag))).toBeLessThan(5);
});

test('large live backlog seeks forward and late decoder output cannot rewind the clock', async ({page}) => {
    const result = await page.evaluate(async () => {
        const {default: Queue} = await import('/packages/player/src/services/renderingEngines/video-frame-queue.ts');
        const queue = new Queue({live: true});
        const closed = [];
        const push = (pts, now) => queue.push({timestamp: pts, close: () => closed.push(pts)}, now);
        push(0, 0);
        queue.take(60)?.close();
        push(33000, 61);
        queue.updateLiveEdge(2000000, 200);
        const cutoff = queue.discardBeforePTS(200);
        push(100000, 201); // Previously submitted output arrives after the catch-up command.
        push(1850000, 201);
        const caught = queue.take(201);
        const timestamp = caught?.timestamp;
        caught?.close();
        const lag = queue.liveLatencyMs;
        const jumps = queue.fastCatchUps;
        queue.clear();
        return {cutoff, timestamp, lag, jumps, closed};
    });
    expect(result.cutoff).toBe(1850000);
    expect(result.timestamp).toBe(1850000);
    expect(result.lag).toBe(150);
    expect(result.jumps).toBe(1);
    expect(result.closed.sort((a, b) => a - b)).toEqual([0, 33000, 100000, 1850000]);
});

test('a live network stall cannot make the moving discard deadline reject every new frame', async ({page}) => {
    const result = await page.evaluate(async () => {
        const {default: Queue} = await import('/packages/player/src/services/renderingEngines/video-frame-queue.ts');
        const queue = new Queue({live: true});
        let closed = 0, shown = 0, next = 1;
        queue.updateLiveEdge(0, 0);
        queue.push({timestamp: 0, close: () => closed++}, 0);
        queue.take(60)?.close();
        for (let now = 61; now <= 2500; now++) {
            while (next <= 60 && next * 1000 / 30 + 450 <= now) {
                const pts = next++ * 1000000 / 30;
                queue.updateLiveEdge(pts, now);
                queue.push({timestamp: pts, close: () => closed++}, now);
            }
            if (now % 16 === 0) {
                const frame = queue.take(now);
                if (frame) { shown++; frame.close(); }
            }
        }
        const stats = {shown, rebuffers: queue.rebufferCount, lag: queue.liveLatencyMs};
        queue.clear();
        return {...stats, closed};
    });
    expect(result.shown).toBeGreaterThan(50);
    expect(result.rebuffers).toBe(1);
    expect(result.lag).toBeLessThan(150);
    expect(result.closed).toBe(61);
});
