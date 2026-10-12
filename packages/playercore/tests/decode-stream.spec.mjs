import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';

const fixture = name => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));

// Independent FLV tag reader: compare emitted bytes/timestamps with the source,
// not with another invocation of the production demuxer.
function tags(buffer) {
    const result = [];
    for (let offset = buffer.readUInt32BE(5) + 4; offset < buffer.length;) {
        const size = buffer.readUIntBE(offset + 1, 3);
        result.push({
            type: buffer[offset],
            dts: buffer.readUIntBE(offset + 4, 3) + buffer[offset + 7] * 0x1000000,
            body: buffer.subarray(offset + 11, offset + 11 + size)
        });
        offset += 15 + size;
    }
    return result;
}

function makeFLV(items, flags = 5) {
    const header = Buffer.from([70, 76, 86, 1, flags, 0, 0, 0, 9, 0, 0, 0, 0]);
    return Buffer.concat([header, ...items.map(({type, dts, body}) => {
        const tag = Buffer.alloc(15 + body.length);
        tag[0] = type;
        tag.writeUIntBE(body.length, 1, 3);
        tag.writeUIntBE(dts & 0xffffff, 4, 3);
        tag[7] = Math.floor(dts / 0x1000000);
        body.copy(tag, 11);
        tag.writeUInt32BE(body.length + 11, 11 + body.length);
        return tag;
    })]);
}

test.beforeEach(async ({page}, testInfo) => {
    await page.goto(`/packages/playercore/tests/harness.html?format=${testInfo.project.name}`);
    await page.waitForFunction(() => window.loaded);
});

async function collect(page, bytes, {fragmented = false, config = {}} = {}) {
    return page.evaluate(async ({bytes, fragmented, config}) => {
        // A controlled loader exercises the real IOController stash/reassembly.
        class FixtureLoader extends mpegts.BaseLoader {
            constructor() { super('fixture'); this._needStash = false; }
            open() {
                this._status = mpegts.LoaderStatus.kBuffering;
                queueMicrotask(() => {
                    const body = new Uint8Array(bytes);
                    let offset = 0;
                    while (offset < body.length && this.isWorking()) {
                        const length = fragmented ? [1, 2, 5, 13, 127][offset % 5] : body.length;
                        const chunk = body.slice(offset, offset + length);
                        this.onDataArrival(chunk.buffer, offset, offset + chunk.length);
                        offset += chunk.length;
                    }
                    this._status = mpegts.LoaderStatus.kComplete;
                    this.onComplete?.(0, body.length - 1);
                });
            }
            abort() { this._status = mpegts.LoaderStatus.kComplete; }
        }
        // The new path must work even when media playback APIs are unavailable.
        window.MediaSource = class { constructor() { throw new Error('Unexpected MSE'); } };
        window.VideoDecoder = class { constructor() { throw new Error('Unexpected decoder'); } };
        window.Worker = class { constructor() { throw new Error('Unexpected Worker'); } };
        const source = {type: 'flv', url: '/fixture.flv', isLive: true};
        const stream = mpegts.createStream(source, {
            webcodec: true, enableStashBuffer: false, customLoader: FixtureLoader, ...config
        });
        const configs = [], samples = [], pcm = [], errors = [], order = [];
        stream.on('track_config', item => {
            configs.push({...item, description: item.description && Array.from(item.description)});
            order.push(`config:${item.type}:${item.configId}`);
        });
        stream.on('encoded_sample', item => {
            samples.push(item); // Deliberately retain buffers until all input is consumed.
            order.push(`sample:${item.type}:${item.configId}`);
        });
        stream.on('pcm_data', item => pcm.push({
            info: item.info, samples: Array.from(new Int16Array(item.data))
        }));
        await new Promise(resolve => {
            stream.on('error', error => { errors.push(error); resolve(); });
            stream.on('loading_complete', resolve);
            stream.start();
            stream.start(); // Idempotent while running.
        });
        const state = stream.state;
        stream.destroy();
        stream.destroy();
        await Promise.resolve();
        return {
            configs, samples: samples.map(item => ({...item, data: Array.from(item.data)})),
            pcm, errors, state, order, sourceUnchanged: !source.segments
        };
    }, {bytes: Array.from(bytes), fragmented, config});
}

for (const webcodec of [undefined, false, 'true', 1]) {
    test(`createStream webcodec=${JSON.stringify(webcodec)} retains split MSE playback`, async ({page}) => {
        await page.evaluate(webcodec => {
            const config = {enableWorker: true, enableStashBuffer: false, lazyLoad: false};
            if (webcodec !== undefined) config.webcodec = webcodec;
            window.playerErrors = [];
            window.player = mpegts.createStream({
                type: 'flv', url: '/packages/playercore/tests/fixtures/av.flv', splitAVBuffers: true
            }, config);
            if (!(player instanceof mpegts.MSEPlayer)) throw new Error('Legacy routing changed');
            player.on('error', (...args) => playerErrors.push(args));
            player.attachMediaElement(document.querySelector('#video'), document.querySelector('#audio'));
            player.load();
            player.play();
        }, webcodec);
        await page.waitForFunction(() => {
            if (playerErrors.length) throw new Error(JSON.stringify(playerErrors));
            return document.querySelector('#video').currentTime > 0.2 && document.querySelector('#audio').currentTime > 0.2;
        });
        await page.evaluate(() => player.destroy());
    });
}

for (const name of ['av.flv', 'hevc.flv']) {
    for (const fragmented of [false, true]) {
        test(`${name} emits owned complete samples, fragmented=${fragmented}`, async ({page}) => {
            const bytes = fixture(name);
            const result = await collect(page, bytes, {fragmented});
            expect(result.errors).toEqual([]);
            expect(result.state).toBe('complete');
            expect(result.sourceUnchanged).toBe(true);
            const input = tags(bytes);
            const videoConfig = result.configs.find(c => c.type === 'video');
            expect(videoConfig.description).toEqual(Array.from(input.find(t => t.type === 9 && t.body[1] === 0).body.subarray(5)));
            expect(videoConfig.codedWidth).toBe(160);
            expect(videoConfig.codec).toMatch(name === 'hevc.flv' ? /^hvc1\./ : /^avc1\./);
            for (const [track, tagType, skip] of [['video', 9, 5], ['audio', 8, 2]]) {
                const emitted = result.samples.filter(s => s.type === track);
                const expected = input.filter(t => t.type === tagType && t.body[1] === 1);
                expect(emitted).toHaveLength(expected.length);
                for (let i = 0; i < expected.length; i++) {
                    const tag = expected[i];
                    const cts = track === 'video' ? tag.body.readIntBE(2, 3) : 0;
                    expect(emitted[i]).toMatchObject({
                        data: Array.from(tag.body.subarray(skip)), dts: tag.dts * 1000,
                        pts: (tag.dts + cts) * 1000, timebase: 1000000, configId: 1,
                        isKeyframe: track === 'audio' || (tag.body[0] >> 4) === 1
                    });
                }
            }
            for (let i = 0; i < result.order.length; i++) {
                if (result.order[i].startsWith('sample:')) {
                    expect(result.order.slice(0, i)).toContain(result.order[i].replace('sample:', 'config:'));
                }
            }
        });
    }
}

test('negative CTS and configuration changes preserve order and old sample config IDs', async ({page}) => {
    const video = tags(fixture('av.flv')).filter(t => t.type === 9);
    const init = video.find(t => t.body[1] === 0);
    const frame = video.find(t => t.body[1] === 1);
    const first = {...frame, dts: 100, body: Buffer.from(frame.body)};
    first.body.writeIntBE(-20, 2, 3);
    const changed = {...init, body: Buffer.from(init.body)};
    changed.body[changed.body.length - 1] ^= 1;
    const second = {...frame, dts: 200};
    const result = await collect(page, makeFLV([init, first, changed, second], 1));
    expect(result.errors).toEqual([]);
    expect(result.order).toEqual(['config:video:1', 'sample:video:1', 'config:video:2', 'sample:video:2']);
    expect(result.samples.map(s => [s.configId, s.dts, s.pts])).toEqual([[1, 100000, 80000], [2, 200000, 200000]]);
});

test('audio-only AAC emits a paired config and drains the final sample', async ({page}) => {
    const audio = tags(fixture('av.flv')).filter(t => t.type === 8);
    const result = await collect(page, makeFLV(audio, 4), {fragmented: true});
    expect(result.errors).toEqual([]);
    expect(result.configs).toHaveLength(1);
    const config = result.configs[0];
    expect(config.type).toBe('audio');
    expect(config.codec).toBe(`mp4a.40.${config.description[0] >> 3}`);
    expect(config.sampleRate).toBe(44100);
    expect(config.numberOfChannels).toBe(1);
    expect(result.samples).toHaveLength(audio.filter(t => t.body[1] === 1).length);
    expect(result.samples.every(s => s.type === 'audio' && s.codec === config.codec)).toBe(true);
});

test('EOF drains samples when the final sequence header suppresses normal dispatch', async ({page}) => {
    const input = tags(fixture('av.flv'));
    const videoInit = input.find(t => t.type === 9 && t.body[1] === 0);
    const frame = input.find(t => t.type === 9 && t.body[1] === 1);
    const audioInit = input.find(t => t.type === 8 && t.body[1] === 0);
    const result = await collect(page, makeFLV([videoInit, frame, audioInit]));
    expect(result.errors).toEqual([]);
    expect(result.samples).toHaveLength(1);
    expect(result.samples[0].data).toEqual(Array.from(frame.body.subarray(5)));
});

test('G.711 PCM bypasses encoded output and retains rate/channel changes', async ({page}) => {
    const result = await collect(page, makeFLV([
        {type: 8, dts: 0, body: Buffer.from([0x72, 0xd5, 0x55])},
        {type: 8, dts: 20, body: Buffer.from([0x87, 0x80, 0x00])}
    ], 4), {fragmented: true});
    expect(result.errors).toEqual([]);
    expect(result.configs).toEqual([]);
    expect(result.samples).toEqual([]);
    expect(result.pcm).toEqual([
        {info: {sampleRate: 8000, channelCount: 1, format: 's16le'}, samples: [8, -8]},
        {info: {sampleRate: 16000, channelCount: 2, format: 's16le'}, samples: [32124, -32124]}
    ]);
});

test('bad format and truncated FLV stop with an error', async ({page}) => {
    for (const bytes of [Buffer.from('not a flv stream'), fixture('av.flv').subarray(0, 18)]) {
        const result = await collect(page, bytes, {fragmented: true});
        expect(result.state).toBe('error');
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].type).toBe('demux');
    }
});

test('stop/restart inside a sample callback suppresses the old session and releases IO', async ({page}) => {
    const result = await page.evaluate(async bytes => {
        const loaders = [];
        class ManualLoader extends mpegts.BaseLoader {
            constructor() { super('manual'); this._needStash = false; loaders.push(this); }
            open() { this._status = mpegts.LoaderStatus.kBuffering; }
            abort() { this._status = mpegts.LoaderStatus.kComplete; }
            destroy() { this.disposed = true; super.destroy(); }
        }
        const stream = mpegts.createStream({type: 'flv', url: '/manual.flv', isLive: true}, {
            webcodec: true, enableStashBuffer: false, customLoader: ManualLoader
        });
        const received = [], errors = [];
        stream.on('error', error => errors.push(error));
        let restarted = false;
        stream.on('encoded_sample', sample => {
            received.push(sample.type);
            if (!restarted) {
                restarted = true;
                stream.stop(); stream.stop(); stream.start();
            } else {
                stream.destroy();
            }
        });
        stream.start();
        const staleIOCallback = stream._session.io.onDataArrival;
        const staleComplete = stream._session.io.onComplete;
        const buffer = new Uint8Array(bytes).buffer;
        loaders[0].onDataArrival(buffer, 0, buffer.byteLength);
        await Promise.resolve();
        staleIOCallback(buffer, 0); staleComplete();
        loaders[1].onDataArrival(buffer, 0, buffer.byteLength);
        await Promise.resolve();
        return {received, errors, state: stream.state, disposed: loaders.map(l => l.disposed)};
    }, Array.from(fixture('av.flv')));
    expect(result).toEqual({received: ['audio', 'audio'], errors: [], state: 'destroyed', disposed: [true, true]});
});

test('real fetch output and network errors need no media attachment', async ({page}) => {
    await page.route('**/decode-stream-missing.flv', route => route.fulfill({status: 404, body: 'Not found'}));
    const result = await page.evaluate(async () => {
        const run = url => new Promise(resolve => {
            const stream = mpegts.createStream({type: 'flv', url, isLive: true}, {webcodec: true, enableStashBuffer: false});
            let samples = 0;
            stream.on('encoded_sample', () => samples++);
            stream.on('loading_complete', () => { stream.destroy(); resolve({samples}); });
            stream.on('error', error => { stream.destroy(); resolve({error}); });
            stream.start();
        });
        return {ok: await run('/packages/playercore/tests/fixtures/av.flv'), bad: await run('/decode-stream-missing.flv')};
    });
    expect(result.ok.samples).toBeGreaterThan(0);
    expect(result.bad.error.type).toBe('network');
});

test('configuration and sample buffers can be transferred without detaching future input', async ({page}) => {
    const result = await page.evaluate(async () => {
        const stream = mpegts.createStream({type: 'flv', url: '/packages/playercore/tests/fixtures/av.flv'}, {
            webcodec: true, enableStashBuffer: false
        });
        let samples = 0;
        const errors = [];
        const transferred = [];
        const detach = data => {
            transferred.push(structuredClone(data, {transfer: [data.buffer]}).byteLength);
            if (data.byteLength !== 0) throw new Error('Buffer was not transferred');
        };
        stream.on('track_config', config => { if (config.description) detach(config.description); });
        stream.on('encoded_sample', sample => { samples++; detach(sample.data); });
        await new Promise(resolve => {
            stream.on('loading_complete', resolve);
            stream.on('error', error => { errors.push(error); resolve(); });
            stream.start();
        });
        stream.destroy();
        return {samples, errors, allNonempty: transferred.every(size => size > 0)};
    });
    const count = tags(fixture('av.flv')).filter(t => [8, 9].includes(t.type) && t.body[1] === 1).length;
    expect(result).toEqual({samples: count, errors: [], allNonempty: true});
});

test('startup flag is snapshotted and named exports match the public core entry', async ({page}) => {
    expect(await page.evaluate(async () => {
        const {createStream, DecodeStreamEvents, default: core} = await import('/packages/playercore/src/index.js');
        const options = {webcodec: true};
        const stream = createStream({type: 'flv', url: '/unused.flv'}, options);
        options.webcodec = false;
        const idle = stream.state === 'idle';
        stream.destroy();
        return idle && createStream === core.createStream && DecodeStreamEvents === core.DecodeStreamEvents;
    })).toBe(true);
});

test('unsupported new-path options fail before loading; createPlayer remains legacy', async ({page}) => {
    expect(await page.evaluate(() => {
        const source = {type: 'flv', url: '/unused.flv'};
        const failures = [];
        for (const [input, config] of [
            [{...source, type: 'mpegts'}, {webcodec: true}],
            [{...source, segments: []}, {webcodec: true}],
            [source, {webcodec: true, enableWorker: true}]
        ]) {
            try { mpegts.createStream(input, config); failures.push(false); }
            catch (error) { failures.push(error instanceof TypeError); }
        }
        const old = mpegts.createPlayer(source, {webcodec: true});
        const isLegacy = old instanceof mpegts.MSEPlayer;
        old.destroy();
        return {failures, isLegacy};
    })).toEqual({failures: [true, true, true], isLegacy: true});
});
