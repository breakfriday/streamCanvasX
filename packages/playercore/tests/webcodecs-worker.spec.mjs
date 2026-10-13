import {test, expect} from '@playwright/test';

test.beforeEach(async ({page}, testInfo) => {
    await page.goto(`/packages/playercore/tests/harness.html?format=${testInfo.project.name}`);
    await page.waitForFunction(() => window.loaded);
});

for (const enableWorker of [undefined, false, true]) {
    test(`new path always uses Worker, enableWorker=${enableWorker}`, async ({page}) => {
        const workers = [];
        page.on('worker', worker => workers.push(worker));
        const result = await page.evaluate(async enableWorker => {
            window.MediaSource = class { constructor() { throw Error('Unexpected MSE'); } };
            window.VideoDecoder = class { constructor() { throw Error('Unexpected main-thread decoder'); } };
            const stream = mpegts.createStream({type: 'flv', url: '/packages/playercore/tests/fixtures/av.flv'}, {
                webcodec: true, enableWorker, enableStashBuffer: false
            });
            const errors = [];
            let samples = 0;
            stream.on('encoded_sample', () => samples++);
            await new Promise(resolve => {
                stream.on('loading_complete', resolve);
                stream.on('error', error => { errors.push(error); resolve(); });
                stream.start(); stream.start();
            });
            const state = stream.state;
            stream.destroy();
            return {samples, errors, state};
        }, enableWorker);
        expect(workers).toHaveLength(1);
        expect(result.errors).toEqual([]);
        expect(result.samples).toBeGreaterThan(0);
        expect(result.state).toBe('complete');
    });
}

test('Worker decodes real H.264 to blue VideoFrames without main-thread media APIs', async ({page}) => {
    const result = await page.evaluate(async () => {
        window.MediaSource = class { constructor() { throw Error('Unexpected MSE'); } };
        window.VideoDecoder = class { constructor() { throw Error('Unexpected main-thread decoder'); } };
        const stream = mpegts.createDecodePipeline({type: 'flv', url: '/packages/playercore/tests/fixtures/av.flv'}, {
            webcodec: true, enableWorker: false, enableStashBuffer: false, emitEncodedSamples: true
        });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const frames = [], errors = [], order = [];
        const retained = [];
        const samples = [];
        stream.on('encoded_sample', sample => {
            samples.push({type: sample.type, length: sample.data.byteLength});
            // Detaching debug copies must not corrupt pending decoder input.
            structuredClone(sample.data, {transfer: [sample.data.buffer]});
        });
        stream.on('track_config', config => {
            if (config.description) structuredClone(config.description, {transfer: [config.description.buffer]});
        });
        stream.on('video_frame', frame => {
            retained.push(frame);
            canvas.width = frame.displayWidth;
            canvas.height = frame.displayHeight;
            ctx.drawImage(frame, 0, 0);
            frames.push({width: frame.displayWidth, timestamp: frame.timestamp,
                pixel: Array.from(ctx.getImageData(20, 20, 1, 1).data)});
            order.push('frame');
        });
        stream.on('loading_complete', () => order.push(`loaded:${stream.state}`));
        await new Promise(resolve => {
            stream.on('decode_complete', () => { order.push('decoded'); resolve(); });
            stream.on('error', error => { errors.push(error); resolve(); });
            stream.start();
        });
        const state = stream.state;
        const released = retained.every(frame => frame.codedWidth === 0);
        stream.destroy();
        return {frames, errors, samples, order, state, released};
    });
    expect(result.errors).toEqual([]);
    expect(result.frames.length).toBeGreaterThan(0);
    expect(result.samples.some(s => s.type === 'audio')).toBe(true);
    expect(result.samples.every(s => s.length > 0)).toBe(true);
    for (const frame of result.frames) {
        expect(frame.width).toBe(160);
        expect(frame.pixel[2]).toBeGreaterThan(200);
        expect(frame.pixel[0]).toBeLessThan(30);
    }
    expect(result.order).toContain('loaded:running');
    expect(result.order.at(-1)).toBe('decoded');
    expect(result.state).toBe('complete');
    expect(result.released).toBe(true);
});

test('stop/restart inside a Worker sample callback ignores the entire previous run', async ({page}) => {
    const workers = [];
    page.on('worker', worker => workers.push(worker));
    const result = await page.evaluate(async () => {
        const stream = mpegts.createStream({type: 'flv', url: '/packages/playercore/tests/fixtures/av.flv'}, {
            webcodec: true, enableStashBuffer: false
        });
        const errors = [];
        let first = true, samples = 0, complete = 0;
        stream.on('encoded_sample', () => {
            if (first) { first = false; stream.stop(); stream.start(); }
            else samples++;
        });
        await new Promise(resolve => {
            stream.on('error', error => { errors.push(error); resolve(); });
            stream.on('loading_complete', () => { complete++; resolve(); });
            stream.start();
        });
        stream.destroy(); stream.destroy();
        return {errors, samples, complete, state: stream.state};
    });
    expect(workers).toHaveLength(2);
    expect(result.errors).toEqual([]);
    expect(result.samples).toBeGreaterThan(0);
    expect(result.complete).toBe(1);
    expect(result.state).toBe('destroyed');
});

test('Worker initialization failure reports once and does not fall back to MSE', async ({page}) => {
    const result = await page.evaluate(() => {
        window.Worker = class { constructor() { throw Error('Worker blocked'); } };
        window.MediaSource = class { constructor() { throw Error('Unexpected fallback'); } };
        const stream = mpegts.createDecodePipeline({type: 'flv', url: '/unused.flv'}, {webcodec: true});
        const errors = [];
        stream.on('error', error => errors.push(error));
        stream.start();
        const state = stream.state;
        stream.destroy();
        return {errors, state};
    });
    expect(result.state).toBe('error');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].type).toBe('worker');
});

test('presentation feedback pauses real Worker decoding and resumes through EOF without dropping frames', async ({page}) => {
    const result = await page.evaluate(async () => {
        const stream = mpegts.createDecodePipeline({type: 'flv', url: '/packages/playercore/tests/fixtures/av.flv'}, {
            webcodec: true, enableStashBuffer: false, presentationFeedback: true
        });
        const frames = [], errors = [], held = [];
        let blocked = true, complete = false;
        const report = () => stream.updatePresentationState({state: 'playing', queuedFrames: held.length,
            bufferedAheadMs: held.length ? 500 : 0, presentedPTS: frames.at(-1) ?? null});
        stream.on('video_frame', frame => {
            frames.push(frame.timestamp);
            if (blocked) held.push(frame.clone());
            report();
        });
        const done = new Promise(resolve => {
            stream.on('decode_complete', () => { complete = true; resolve(); });
            stream.on('error', error => { errors.push(error); resolve(); });
        });
        stream.start();
        // Wait until the initial bounded output burst has settled while no frames are consumed.
        await new Promise(resolve => setTimeout(resolve, 400));
        const first = frames.length;
        await new Promise(resolve => setTimeout(resolve, 150));
        const paused = {frames: frames.length, stable: frames.length === first, complete};
        blocked = false;
        for (const frame of held) frame.close();
        held.length = 0; report();
        await done;
        const state = stream.state;
        stream.destroy();
        return {paused, frames, errors, state};
    });
    expect(result.errors).toEqual([]);
    expect(result.paused.frames).toBeGreaterThan(0);
    expect(result.paused.frames).toBeLessThan(45);
    expect(result.paused.stable).toBe(true);
    expect(result.paused.complete).toBe(false);
    expect(result.frames).toHaveLength(45);
    expect(new Set(result.frames).size).toBe(45);
    expect(result.state).toBe('complete');
});

test('presentation snapshots carry receipt counts and stale-generation frames are closed', async ({page}) => {
    const result = await page.evaluate(() => {
        const messages = [], retained = [];
        let worker;
        window.Worker = class {
            constructor() { worker = this; }
            postMessage(message) { messages.push(message); }
            terminate() {}
        };
        const stream = mpegts.createDecodePipeline({type: 'flv', url: '/unused.flv'}, {
            webcodec: true, presentationFeedback: true
        });
        let resets = 0;
        const report = () => stream.updatePresentationState({state: 'playing', queuedFrames: retained.length,
            bufferedAheadMs: 0, presentedPTS: null});
        stream.on('video_frame', frame => { retained.push(frame.clone()); report(); });
        stream.on('video_reset', () => {
            resets++;
            for (const frame of retained) frame.close();
            retained.length = 0; report();
        });
        stream.start();
        worker.onmessage({data: {event: 'ready'}});
        const sessionId = messages[0].sessionId;
        const source = document.createElement('canvas');
        const frame = new VideoFrame(source, {timestamp: 0});
        worker.onmessage({data: {event: 'video_frame', data: frame, sessionId, generation: 0}});
        const snapshot = messages.find(message => message.cmd === 'presentation-state');
        const ack = messages.find(message => message.cmd === 'frame-released');
        worker.onmessage({data: {event: 'video_reset', data: {reason: 'test'}, sessionId, generation: 1}});
        const stale = new VideoFrame(source, {timestamp: 33333});
        worker.onmessage({data: {event: 'video_frame', data: stale, sessionId, generation: 0}});
        stream.destroy();
        return {snapshot, ack, resets, retained: retained.length, closed: [frame.codedWidth, stale.codedWidth],
            resetSnapshot: messages.filter(message => message.cmd === 'presentation-state').at(-1)};
    });
    expect(result.snapshot.receivedFrames).toBe(1);
    expect(result.snapshot.state.queuedFrames).toBe(1);
    expect(result.ack.receivedFrames).toBe(1);
    expect(result.resetSnapshot.generation).toBe(1);
    expect(result.resetSnapshot.receivedFrames).toBe(0);
    expect(result.resets).toBe(1);
    expect(result.retained).toBe(0);
    expect(result.closed).toEqual([0, 0]);
});

test('a live FLV burst catches up to the receive edge instead of replaying all accumulated history', async ({page}) => {
    const result = await page.evaluate(async () => {
        const stream = mpegts.createDecodePipeline({type: 'flv', isLive: true,
            url: '/packages/playercore/tests/fixtures/av.flv'}, {
            webcodec: true, enableStashBuffer: false, presentationFeedback: true
        });
        const frames = [], edges = [], errors = [];
        let discarded = 0;
        stream.on('video_live_edge', ({pts}) => edges.push(pts));
        stream.on('video_buffer_stats', stats => { discarded = Math.max(discarded, stats.decodeDiscardedFrames + stats.encodedSkippedFrames); });
        stream.on('video_frame', frame => {
            frames.push(frame.timestamp);
            stream.updatePresentationState({state: 'playing', queuedFrames: 0, bufferedAheadMs: 0,
                presentedPTS: frame.timestamp});
        });
        await new Promise(resolve => {
            stream.on('decode_complete', resolve);
            stream.on('error', error => { errors.push(error); resolve(); });
            stream.start();
        });
        stream.destroy();
        return {frames, edges, errors, discarded};
    });
    expect(result.errors).toEqual([]);
    expect(result.edges.length).toBeGreaterThan(0);
    expect(result.frames.length).toBeGreaterThan(0);
    expect(result.frames.length).toBeLessThan(10);
    expect(result.discarded).toBeGreaterThan(30);
    expect(result.frames.at(-1)).toBe(result.edges.at(-1));
    expect(result.frames[0]).toBeGreaterThanOrEqual(result.edges.at(-1) - 150000);
});

test('decoder configuration ordering, PTS, keyframe gate, EOF flush and cancellation', async ({page}) => {
    const result = await page.evaluate(async () => {
        const {default: Decoder} = await import('/packages/playercore/src/decode/video-decoder.ts');
        const calls = [], errors = [];
        const checks = [];
        window.VideoDecoder = class extends EventTarget {
            state = 'unconfigured'; decodeQueueSize = 0;
            static isConfigSupported(config) {
                return new Promise(resolve => checks.push(() => resolve({supported: true, config})));
            }
            configure(config) { this.state = 'configured'; calls.push(['config', config.codec]); }
            decode(chunk) { calls.push(['decode', chunk.timestamp, chunk.type]); }
            flush() { calls.push(['flush']); return Promise.resolve(); }
            close() { this.state = 'closed'; calls.push(['close']); }
        };
        const config = id => ({type: 'video', codec: 'avc1.42c00b', configId: id,
            description: new Uint8Array([1]), codedWidth: 160, codedHeight: 96, displayWidth: 160, displayHeight: 90});
        const sample = (id, key, pts) => ({type: 'video', configId: id, isKeyframe: key,
            data: new Uint8Array([1]), pts, dts: pts - 2000});
        const decoder = new Decoder({onFrame: frame => frame.close(), onError: error => errors.push(error.message)});
        decoder.configure(config(1));
        decoder.decode(sample(1, false, 0));
        decoder.decode(sample(1, true, 1000));
        decoder.configure(config(2));
        decoder.decode(sample(2, true, 2000));
        const done = decoder.finish();
        await new Promise(resolve => setTimeout(resolve));
        checks.shift()();
        await new Promise(resolve => setTimeout(resolve));
        checks.shift()();
        await done;
        decoder.destroy();
        const cancelled = new Decoder({onFrame: frame => frame.close(), onError: error => errors.push(error.message)});
        cancelled.configure(config(1));
        cancelled.decode(sample(1, true, 9000));
        const cancelledDone = cancelled.finish();
        await new Promise(resolve => setTimeout(resolve));
        cancelled.destroy();
        checks.shift()();
        await cancelledDone;
        return {calls, errors};
    });
    expect(result.errors).toEqual([]);
    expect(result.calls).toEqual([
        ['config', 'avc1.42c00b'], ['decode', 1000, 'key'], ['flush'],
        ['config', 'avc1.42c00b'], ['decode', 2000, 'key'], ['flush'], ['close'], ['close']
    ]);
});

test('unsupported codec and input overload fail explicitly without submitting broken frames', async ({page}) => {
    const result = await page.evaluate(async () => {
        const {default: Decoder} = await import('/packages/playercore/src/decode/video-decoder.ts');
        window.VideoDecoder = class extends EventTarget {
            state = 'unconfigured'; decodeQueueSize = 0;
            static async isConfigSupported() { return {supported: false}; }
            configure() { throw Error('Unexpected configure'); }
            close() { this.state = 'closed'; }
        };
        const errors = [];
        const callbacks = {onFrame: frame => frame.close(), onError: error => errors.push(error.message)};
        const decoder = new Decoder(callbacks);
        decoder.configure({codec: 'hvc1.unsupported', configId: 1, description: new Uint8Array([1])});
        await decoder.finish();
        const overloaded = new Decoder(callbacks);
        for (let i = 0; i < 121; i++) overloaded.decode({configId: 1, data: new Uint8Array([1])});
        await overloaded.finish();
        return errors;
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toContain('Unsupported video codec');
    expect(result[1]).toContain('queue exceeded');
});

test('optional live stream sustains decoding and restarts cleanly', async ({page}, testInfo) => {
    const url = process.env.STREAMCANVASX_LIVE_URL;
    test.skip(!url, 'Set STREAMCANVASX_LIVE_URL to validate a running live server');
    const result = await page.evaluate(async url => {
        const stream = mpegts.createDecodePipeline({type: 'flv', url, isLive: true}, {
            webcodec: true, enableStashBuffer: false
        });
        const canvas = document.createElement('canvas');
        document.body.appendChild(canvas);
        const ctx = canvas.getContext('2d');
        let frames = 0;
        const errors = [], configs = [];
        stream.on('error', error => errors.push(error));
        stream.on('track_config', config => configs.push({type: config.type, codec: config.codec}));
        stream.on('video_frame', frame => {
            frames++;
            if (canvas.width !== frame.displayWidth) canvas.width = frame.displayWidth;
            if (canvas.height !== frame.displayHeight) canvas.height = frame.displayHeight;
            ctx.drawImage(frame, 0, 0);
        });
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        stream.start();
        await wait(7000);
        const first = {frames, state: stream.state};
        stream.stop();
        const stopped = frames;
        await wait(300);
        const stableWhileStopped = frames === stopped;
        stream.start();
        await wait(7000);
        const second = {frames: frames - stopped, state: stream.state};
        stream.destroy();
        return {first, second, stableWhileStopped, errors, configs, width: canvas.width, height: canvas.height};
    }, url);
    await testInfo.attach('live-results', {body: JSON.stringify(result, null, 2), contentType: 'application/json'});
    await page.screenshot({path: `/tmp/streamcanvasx-live-${testInfo.project.name}.png`});
    expect(result.errors).toEqual([]);
    expect(result.first.state).toBe('running');
    expect(result.second.state).toBe('running');
    expect(result.first.frames).toBeGreaterThan(10);
    expect(result.second.frames).toBeGreaterThan(10);
    expect(result.stableWhileStopped).toBe(true);
});

test('real Worker skips compressed GOPs, resets transport and decodes the latest IDR with valid pixels', async ({page}) => {
    const result = await page.evaluate(async () => {
        const original = new Uint8Array(await (await fetch('/packages/playercore/tests/fixtures/av.flv')).arrayBuffer());
        let configTag, idrTag;
        for (let offset = 13; offset + 11 <= original.length;) {
            const size = original[offset + 1] * 65536 + original[offset + 2] * 256 + original[offset + 3];
            if (original[offset] === 9 && (original[offset + 11] & 15) === 7) {
                if (original[offset + 12] === 0) configTag = original.slice(offset, offset + 11 + size + 4);
                if (original[offset + 12] === 1 && original[offset + 11] >> 4 === 1) {
                    idrTag = original.slice(offset, offset + 11 + size + 4); break;
                }
            }
            offset += 11 + size + 4;
        }
        if (!configTag || !idrTag) throw Error('Fixture requires AVC config and IDR');
        const header = original.slice(0, 13); header[4] = 1;
        const parts = [header, configTag];
        for (let i = 0; i < 80; i++) {
            const tag = idrTag.slice(), ms = i * 100;
            tag[4] = ms >> 16; tag[5] = ms >> 8; tag[6] = ms; tag[7] = ms >>> 24;
            tag[13] = tag[14] = tag[15] = 0; // CTS = 0.
            parts.push(tag);
        }
        const url = URL.createObjectURL(new Blob(parts, {type: 'video/x-flv'}));
        const stream = mpegts.createDecodePipeline({type: 'flv', isLive: true, url},
            {webcodec: true, enableStashBuffer: false, presentationFeedback: true});
        const frames = [], resets = [], errors = [];
        let stats, pixel;
        const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 96;
        const ctx = canvas.getContext('2d');
        stream.on('video_reset', reset => resets.push(reset.reason));
        stream.on('video_buffer_stats', value => { stats = value; });
        stream.on('video_frame', frame => {
            frames.push(frame.timestamp);
            ctx.drawImage(frame, 0, 0); pixel = [...ctx.getImageData(40,40,1,1).data];
            stream.updatePresentationState({state: 'playing', queuedFrames: 0, bufferedAheadMs: 0,
                presentedPTS: frame.timestamp});
        });
        await new Promise(resolve => {
            stream.on('decode_complete', resolve);
            stream.on('error', error => { errors.push(error); resolve(); });
            stream.start();
        });
        stream.destroy(); URL.revokeObjectURL(url);
        return {frames, resets, errors, stats, pixel};
    });
    expect(result.errors).toEqual([]);
    expect(result.resets).toContain('live-keyframe-catchup');
    expect(result.stats.encodedSkippedFrames).toBeGreaterThan(30);
    expect(result.frames.length).toBeGreaterThan(0);
    expect(result.frames.length).toBeLessThan(10);
    expect(result.frames.at(-1)).toBe(7900000);
    expect(result.pixel[2]).toBeGreaterThan(200);
    expect(result.pixel[0]).toBeLessThan(30);
});
