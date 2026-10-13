import {test, expect} from '@playwright/test';

test.beforeEach(async ({page}) => { await page.goto('/'); });

test('encoded queue preserves decode order and configuration barriers with byte/time bounds', async ({page}) => {
    const result = await page.evaluate(async () => {
        const {default: Queue} = await import('/packages/playercore/src/decode/encoded-video-queue.ts');
        const queue = new Queue(3, 10, 100);
        const sample = (dts, pts) => ({dts, pts, data: new Uint8Array(2), configId: 1});
        queue.push({kind: 'config', config: {configId: 1}});
        queue.push({kind: 'sample', sample: sample(0, 66000)});
        queue.push({kind: 'sample', sample: sample(33000, 0)});
        queue.push({kind: 'sample', sample: sample(66000, 33000)});
        const stats = [queue.sampleCount, queue.byteLength, queue.bufferedMs];
        const order = [];
        while (queue.size) {
            const item = queue.shift(); order.push(item.kind === 'sample' ? item.sample.pts : 'config');
        }
        const errors = [];
        try { queue.push({kind: 'sample', sample: {...sample(0, 0), data: new Uint8Array(11)}}); }
        catch (error) { errors.push(error.message); }
        queue.push({kind: 'sample', sample: sample(0, 0)});
        try { queue.push({kind: 'sample', sample: sample(101000, 101000)}); }
        catch (error) { errors.push(error.message); }
        queue.clear();
        return {stats, order, errors, remaining: [queue.size, queue.byteLength]};
    });
    expect(result.stats).toEqual([3, 6, 66]);
    expect(result.order).toEqual(['config', 66000, 0, 33000]);
    expect(result.errors).toHaveLength(2);
    expect(result.remaining).toEqual([0, 0]);
});

test('presentation pressure holds compressed input, then resumes and flushes EOF in order', async ({page}) => {
    const result = await page.evaluate(async () => {
        const {default: Scheduler} = await import('/packages/playercore/src/decode/video-decode-scheduler.ts');
        const decoded = [], errors = [];
        let flushes = 0;
        window.VideoDecoder = class extends EventTarget {
            state = 'unconfigured'; decodeQueueSize = 0;
            constructor(callbacks) { super(); this.callbacks = callbacks; }
            static async isConfigSupported(config) { return {supported: true, config}; }
            configure() { this.state = 'configured'; }
            decode(chunk) { decoded.push(chunk.timestamp); this.callbacks.output({timestamp: chunk.timestamp, close() {}}); }
            async flush() { flushes++; }
            close() { this.state = 'closed'; }
        };
        let retainedFrames = 12;
        const scheduler = new Scheduler({onFrame: frame => frame.close(), onError: e => errors.push(e.message)},
            () => ({retainedFrames, bufferedAheadMs: retainedFrames ? 300 : 0}));
        scheduler.configure({codec: 'avc1.42c00b', configId: 1, description: new Uint8Array([1])});
        for (let i = 0; i < 20; i++) scheduler.decode({configId: 1, isKeyframe: i === 0,
            data: new Uint8Array([1]), dts: i * 33333, pts: i * 33333});
        let completed = false;
        const done = scheduler.finish().then(() => { completed = true; });
        await new Promise(resolve => setTimeout(resolve, 10));
        const held = {decoded: decoded.length, queued: scheduler.statistics.encodedFrames, completed};
        retainedFrames = 0; scheduler.notify();
        await done;
        scheduler.destroy();
        return {held, decoded, flushes, errors, remaining: scheduler.statistics.encodedFrames};
    });
    expect(result.held).toEqual({decoded: 0, queued: 20, completed: false});
    expect(result.decoded).toEqual(Array.from({length: 20}, (_, i) => i * 33333));
    expect(result.flushes).toBe(1);
    expect(result.errors).toEqual([]);
    expect(result.remaining).toBe(0);
});

test('codec look-ahead can exceed visible target without deadlocking and cancellation releases queued input', async ({page}) => {
    const result = await page.evaluate(async () => {
        const {default: Scheduler} = await import('/packages/playercore/src/decode/video-decode-scheduler.ts');
        const errors = [], frames = [];
        let native;
        window.VideoDecoder = class extends EventTarget {
            state = 'unconfigured'; decodeQueueSize = 0; input = [];
            constructor(callbacks) { super(); this.callbacks = callbacks; native = this; }
            static async isConfigSupported(config) { return {supported: true, config}; }
            configure() { this.state = 'configured'; }
            decode(chunk) {
                this.input.push(chunk.timestamp);
                if (this.input.length >= 10) this.output();
            }
            output() { this.callbacks.output({timestamp: this.input.shift(), close() {}}); }
            async flush() { while (this.input.length) this.output(); }
            close() { this.state = 'closed'; this.input = []; }
        };
        const callbacks = {onFrame: frame => { frames.push(frame.timestamp); frame.close(); }, onError: e => errors.push(e.message)};
        const scheduler = new Scheduler(callbacks, () => ({retainedFrames: 0, bufferedAheadMs: 0}));
        const config = {codec: 'avc1.42c00b', configId: 1, description: new Uint8Array([1])};
        const sample = i => ({configId: 1, isKeyframe: i === 0, data: new Uint8Array([1]), dts: i * 33333, pts: i * 33333});
        scheduler.configure(config);
        for (let i = 0; i < 20; i++) scheduler.decode(sample(i));
        await scheduler.finish(); scheduler.destroy();
        const stopped = new Scheduler(callbacks, () => ({retainedFrames: 16, bufferedAheadMs: 500}));
        stopped.configure(config);
        for (let i = 0; i < 20; i++) stopped.decode(sample(i));
        const finishing = stopped.finish();
        stopped.destroy(); await finishing;
        return {frames, errors, retained: stopped.statistics.encodedBytes, nativeClosed: native.state};
    });
    expect(result.frames).toHaveLength(20);
    expect(result.errors).toEqual([]);
    expect(result.retained).toBe(0);
    expect(result.nativeClosed).toBe('closed');
});

test('zero native request count does not imply output callbacks have already run', async ({page}) => {
    const result = await page.evaluate(async () => {
        const {default: Scheduler} = await import('/packages/playercore/src/decode/video-decode-scheduler.ts');
        const errors = [], frames = [];
        window.VideoDecoder = class extends EventTarget {
            state = 'unconfigured'; decodeQueueSize = 0; input = [];
            constructor(callbacks) { super(); this.callbacks = callbacks; }
            static async isConfigSupported(config) { return {supported: true, config}; }
            configure() { this.state = 'configured'; }
            decode(chunk) {
                this.input.push(chunk.timestamp);
                if (this.input.length === 32) setTimeout(() => this.output(), 10);
            }
            output() {
                while (this.input.length) this.callbacks.output({timestamp: this.input.shift(), close() {}});
            }
            async flush() { this.output(); }
            close() { this.state = 'closed'; }
        };
        const scheduler = new Scheduler({onFrame: frame => { frames.push(frame.timestamp); frame.close(); },
            onError: error => errors.push(error.message)}, () => ({retainedFrames: 0, bufferedAheadMs: 0}));
        scheduler.configure({codec: 'avc1.42c00b', configId: 1, description: new Uint8Array([1])});
        for (let i = 0; i < 40; i++) scheduler.decode({configId: 1, isKeyframe: i === 0,
            data: new Uint8Array([1]), dts: i * 33333, pts: i * 33333});
        await scheduler.finish(); scheduler.destroy();
        return {frames, errors};
    });
    expect(result.frames).toHaveLength(40);
    expect(result.errors).toEqual([]);
});

test('live backlog bypasses full presentation pressure while decoding every reference picture', async ({page}) => {
    const result = await page.evaluate(async () => {
        const {default: Scheduler} = await import('/packages/playercore/src/decode/video-decode-scheduler.ts');
        const decoded = [], shown = [], errors = [];
        let closed = 0;
        window.VideoDecoder = class extends EventTarget {
            state = 'unconfigured'; decodeQueueSize = 0;
            constructor(callbacks) { super(); this.callbacks = callbacks; }
            static async isConfigSupported(config) { return {supported: true, config}; }
            configure() { this.state = 'configured'; }
            decode(chunk) {
                decoded.push(chunk.timestamp);
                this.callbacks.output({timestamp: chunk.timestamp, close: () => closed++});
            }
            async flush() {}
            close() { this.state = 'closed'; }
        };
        let retainedFrames = 12;
        const scheduler = new Scheduler({onFrame: frame => { shown.push(frame.timestamp); frame.close(); },
            onError: error => errors.push(error.message)},
            () => ({retainedFrames, bufferedAheadMs: 500, presentedPTS: 0}), () => {}, true);
        scheduler.configure({codec: 'avc1.42c00b', configId: 1, description: new Uint8Array([1])});
        for (let i = 0; i < 60; i++) scheduler.decode({configId: 1, isKeyframe: i === 0,
            data: new Uint8Array([1]), dts: i * 33333, pts: i * 33333});
        const finished = scheduler.finish();
        await new Promise(resolve => setTimeout(resolve, 10));
        const pressured = {...scheduler.statistics};
        retainedFrames = 0; scheduler.notify();
        await finished;
        scheduler.destroy();
        return {decoded, shown, closed, pressured, errors};
    });
    expect(result.errors).toEqual([]);
    expect(result.pressured.decodeDiscardedFrames).toBeGreaterThan(50);
    expect(result.pressured.encodedFrames).toBeLessThanOrEqual(5);
    expect(result.decoded).toEqual(Array.from({length: 60}, (_, i) => i * 33333));
    expect(result.shown.length).toBeGreaterThan(0);
    expect(result.shown[0]).toBeGreaterThanOrEqual(59 * 33333 - 150000);
    expect(result.closed).toBe(60);
});

test('restart validation rejects mislabeled keys, CRA, mixed VCL and malformed NAL lengths', async ({page}) => {
    const results = await page.evaluate(async () => {
        const {isSafeVideoRestart: safe} = await import('/packages/playercore/src/decode/video-random-access.ts');
        const config = (hevc, width = 4) => {
            const description = new Uint8Array(hevc ? 23 : 7);
            description[0] = 1; description[hevc ? 21 : 4] = width - 1;
            return {codec: hevc ? 'hvc1.1.6.L93.B0' : 'avc1.42c00b', configId: 1, description};
        };
        const check = (c, bytes, extra = {}) => safe({codec: c.codec, configId: 1, isKeyframe: true,
            data: new Uint8Array(bytes), ...extra}, c);
        const avc = config(false), hevc = config(true);
        return [check(avc, [0,0,0,1,0x65]), check(avc, [0,0,0,1,0x41]),
            check(avc, [0,0,0,9,0x65]), check(avc, [0,0,0,1,0x65,0,0,0,1,0x41]),
            check(avc, [0,0,0,1,0x65], {configId: 2}),
            check(config(false, 1), [1,0x65]), check(config(false, 3), [0,0,1,0x65]),
            check(hevc, [0,0,0,2,38,1]), check(hevc, [0,0,0,2,40,1]),
            check(hevc, [0,0,0,2,42,1]), check(hevc, [0,0,0,2,38,9]),
            check(avc, [0,0,0,1,0x06]), check(avc, [0,0,0,1,0x65,0])];
    });
    expect(results).toEqual([true,false,false,false,false,true,true,true,true,false,false,false,false]);
});

test('queue trims a complete prefix and restores the target config instead of the latest config', async ({page}) => {
    const result = await page.evaluate(async () => {
        const {default: Queue} = await import('/packages/playercore/src/decode/encoded-video-queue.ts');
        const queue = new Queue();
        const config = id => ({configId: id, codec: 'avc1.42c00b', description: new Uint8Array([1,0,0,0,3])});
        const push = (id, dts, pts, key) => queue.push({kind: 'sample', sample: {configId: id,
            codec: 'avc1.42c00b', dts, pts, isKeyframe: key, data: new Uint8Array([0,0,0,1,key ? 0x65 : 0x41])}});
        queue.push({kind: 'config', config: config(1)}); queue.shift(); // Already configured/in flight.
        push(1, 0, 0, true); push(1, 500000, 600000, false);
        queue.push({kind: 'config', config: config(2)});
        push(2, 1000000, 1100000, true); push(2, 1100000, 1000000, false);
        queue.push({kind: 'config', config: config(3)});
        push(3, 1200000, 1200000, false);
        const dropped = queue.skipToLatestKeyframe();
        const commands = [];
        while (queue.size) {
            const entry = queue.shift(); commands.push(entry.kind === 'config' ? `config${entry.config.configId}` : entry.sample.pts);
        }
        const bounded = new Queue(2, 10, 100);
        const sample = pts => ({pts, dts: pts, data: new Uint8Array(2)});
        bounded.push({kind: 'sample', sample: sample(0)});
        try { bounded.push({kind: 'sample', sample: sample(101000)}); } catch {}
        return {dropped, commands, afterFailedPush: [bounded.sampleCount, bounded.byteLength, bounded.bufferedMs]};
    });
    expect(result).toEqual({dropped: 2, commands: ['config2',1100000,1000000,'config3',1200000],
        afterFailedPush: [1,2,0]});
});

for (const blocked of ['configure', 'decode']) {
    test(`live recovery cancels blocked ${blocked}, ignores stale output and starts at an IDR without flushing history`, async ({page}) => {
        const result = await page.evaluate(async blocked => {
            const {default: Scheduler} = await import('/packages/playercore/src/decode/video-decode-scheduler.ts');
            const instances = [], decoded = [], shown = [], errors = [], resets = [];
            let releaseCheck, checks = 0, staleClosed = 0, flushes = 0;
            window.VideoDecoder = class extends EventTarget {
                state = 'unconfigured'; decodeQueueSize = 0;
                constructor(callbacks) { super(); this.callbacks = callbacks; instances.push(this); }
                static async isConfigSupported(config) {
                    checks++;
                    if (blocked === 'configure' && checks === 1) await new Promise(resolve => { releaseCheck = resolve; });
                    return {supported: true, config};
                }
                configure() { this.state = 'configured'; if (blocked === 'decode' && instances[0] === this) this.decodeQueueSize = 8; }
                decode(chunk) { decoded.push(chunk.timestamp); this.callbacks.output({timestamp: chunk.timestamp, close() {}}); }
                async flush() { flushes++; }
                close() { this.state = 'closed'; }
            };
            const scheduler = new Scheduler({onFrame: f => { shown.push(f.timestamp); f.close(); },
                onError: e => errors.push(e.message)}, () => null, () => {}, true, reason => resets.push(reason));
            const config = {codec: 'avc1.42c00b', configId: 1, description: new Uint8Array([1,0,0,0,3])};
            const sample = i => ({...config, isKeyframe: i % 10 === 0,
                data: new Uint8Array([0,0,0,1,i % 10 === 0 ? 0x65 : 0x41]), dts: i * 100000, pts: i * 100000});
            scheduler.configure(config);
            scheduler.decode(sample(0));
            await new Promise(resolve => setTimeout(resolve, 0));
            for (let i = 1; i < 30; i++) scheduler.decode(sample(i));
            await scheduler.finish(); // Must complete even while the OLD support query is unresolved.
            instances[0].callbacks.output({timestamp: 0, close() { staleClosed++; }});
            releaseCheck?.(); await new Promise(resolve => setTimeout(resolve, 0));
            const stats = scheduler.statistics;
            scheduler.destroy();
            return {decoded, shown, errors, resets, flushes, staleClosed, stats, states: instances.map(x => x.state)};
        }, blocked);
        expect(result.errors).toEqual([]);
        expect(result.resets).toEqual(['live-keyframe-catchup']);
        expect(result.decoded[0]).toBe(1000000);
        expect(result.decoded.at(-1)).toBe(2900000);
        expect(result.decoded).not.toContain(0);
        expect(result.shown).not.toContain(0);
        expect(result.staleClosed).toBe(1);
        expect(result.flushes).toBe(1);
        expect(result.stats.encodedSkippedFrames).toBeGreaterThanOrEqual(9);
        expect(result.states).toEqual(['closed','closed']);
    });
}

for (const outcome of ['resume', 'eof', 'destroy', 'nonlive']) {
    test(`hard overflow without a safe key remains bounded: ${outcome}`, async ({page}) => {
        const result = await page.evaluate(async outcome => {
            const {default: Scheduler} = await import('/packages/playercore/src/decode/video-decode-scheduler.ts');
            const errors = [], decoded = [], configs = [], resets = [];
            window.VideoDecoder = class extends EventTarget {
                state = 'unconfigured'; decodeQueueSize = 0;
                constructor(callbacks) { super(); this.callbacks = callbacks; }
                static async isConfigSupported(config) { return {supported: true, config}; }
                configure(config) { this.state = 'configured'; configs.push(config.codedWidth); }
                decode(chunk) { decoded.push(chunk.timestamp); this.callbacks.output({timestamp: chunk.timestamp, close() {}}); }
                async flush() {}
                close() { this.state = 'closed'; }
            };
            const scheduler = new Scheduler({onFrame: f => f.close(), onError: e => errors.push(e.message)},
                () => null, () => {}, outcome !== 'nonlive', reason => resets.push(reason));
            const config = id => ({codec: 'avc1.42c00b', configId: id, codedWidth: id * 16,
                description: new Uint8Array([1,0,0,0,3])});
            const sample = (i, id = 1, key = false, actualKey = key) => ({...config(id), isKeyframe: key,
                dts: i * 1000, pts: i * 1000, data: new Uint8Array([0,0,0,1,actualKey ? 0x65 : 0x41])});
            scheduler.configure(config(1));
            for (let i = 0; i < 130; i++) scheduler.decode(sample(i, 1, i === 0));
            const waiting = scheduler.statistics;
            if (outcome === 'resume') {
                scheduler.configure(config(2)); // Replacement config while waiting.
                scheduler.decode(sample(130, 1, true)); // Stale config must not restart.
                scheduler.decode(sample(131, 2, true, false)); // FLV key flag alone is insufficient.
                scheduler.decode(sample(132, 2, true));
                scheduler.decode(sample(133, 2));
            }
            const done = scheduler.finish();
            if (outcome === 'destroy') scheduler.destroy();
            await done; const final = scheduler.statistics; scheduler.destroy();
            return {errors, decoded, configs, resets, waiting, final};
        }, outcome);
        if (outcome === 'nonlive') {
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]).toContain('queue exceeded');
            expect(result.resets).toEqual([]);
        } else {
            expect(result.errors).toEqual([]);
            expect(result.waiting.waitingForKeyframe).toBe(true);
            expect(result.waiting.encodedBytes).toBe(0);
            expect(result.resets).toEqual(['live-waiting-for-keyframe']);
            expect(result.decoded).toEqual(outcome === 'resume' ? [132000,133000] : []);
            if (outcome === 'resume') {
                expect(result.configs.at(-1)).toBe(32);
                expect(result.final.waitingForKeyframe).toBe(false);
            }
            expect(result.final.encodedBytes).toBe(0);
        }
    });
}

test('live byte/time hard limits and an oversized IDR recover without retaining rejected packets', async ({page}) => {
    const results = await page.evaluate(async () => {
        const {default: Scheduler} = await import('/packages/playercore/src/decode/video-decode-scheduler.ts');
        window.VideoDecoder = class extends EventTarget {
            state = 'unconfigured'; decodeQueueSize = 0;
            constructor(callbacks) { super(); this.callbacks = callbacks; }
            static async isConfigSupported(config) { return {supported: true, config}; }
            configure() { this.state = 'configured'; }
            decode(chunk) { this.callbacks.output({timestamp: chunk.timestamp, close() {}}); }
            async flush() {}
            close() { this.state = 'closed'; }
        };
        const config = {codec: 'avc1.42c00b', configId: 1, description: new Uint8Array([1,0,0,0,3])};
        const sample = (pts, data = new Uint8Array([0,0,0,1,0x65])) => ({...config,
            isKeyframe: true, pts, dts: pts, data});
        const results = [];
        for (const mode of ['time','bytes']) {
            const errors = [], frames = [];
            const scheduler = new Scheduler({onFrame: f => { frames.push(f.timestamp); f.close(); },
                onError: e => errors.push(e.message)}, () => null, () => {}, true);
            scheduler.configure(config); scheduler.decode(sample(0));
            if (mode === 'time') scheduler.decode({...sample(4001000), isKeyframe: false});
            else {
                // A structurally valid IDR that exceeds the single-packet memory budget.
                const huge = new Uint8Array(16 * 1024 * 1024 + 5);
                new DataView(huge.buffer).setUint32(0, huge.length - 4); huge[4] = 0x65;
                scheduler.decode(sample(1000, huge));
            }
            const held = scheduler.statistics;
            scheduler.decode(sample(5000000));
            await scheduler.finish(); scheduler.destroy();
            results.push({errors, frames, waiting: held.waitingForKeyframe, bytes: held.encodedBytes});
        }
        return results;
    });
    expect(results).toEqual([
        {errors: [], frames: [5000000], waiting: true, bytes: 0},
        {errors: [], frames: [5000000], waiting: true, bytes: 0}
    ]);
});
