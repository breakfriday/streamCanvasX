import { test, expect } from '@playwright/test';

// Audio-only FLV, using the device's G.711 SoundRate convention.
function makeFLV(packets) {
    const header = Buffer.from([0x46, 0x4c, 0x56, 1, 4, 0, 0, 0, 9, 0, 0, 0, 0]);
    return Buffer.concat([header, ...packets.map(({codec, rateIndex, channelCount, bytes}, index) => {
        const dataSize = 1 + bytes.length;
        const tag = Buffer.alloc(11 + dataSize + 4);
        tag[0] = 8;
        tag.writeUIntBE(dataSize, 1, 3);
        tag.writeUIntBE(index * 20, 4, 3);
        tag[11] = (codec << 4) | (rateIndex << 2) | 2 | (channelCount - 1);
        Buffer.from(bytes).copy(tag, 12);
        tag.writeUInt32BE(11 + dataSize, 11 + dataSize);
        return tag;
    })]);
}

async function receivePCM(page, context, testInfo, packets, enableWorker) {
    await context.route('**/g711-test.flv', route => route.fulfill({
        contentType: 'video/x-flv', body: makeFLV(packets)
    }));
    await page.goto(`/packages/playercore/tests/harness.html?format=${testInfo.project.name}`);
    await page.waitForFunction(() => window.loaded);
    await page.evaluate(enableWorker => {
        window.pcm = [];
        window.legacyPCM = [];
        window.errors = [];
        window.done = false;
        window.player = mpegts.createPlayer({
            type: 'flv', url: '/g711-test.flv', hasAudio: true, hasVideo: false, isLive: false
        }, {enableWorker, enableStashBuffer: false, lazyLoad: false});
        player.on('audio_segment', (buffer, info) => {
            const view = new DataView(buffer);
            const samples = Array.from({length: view.byteLength / 2}, (_, i) => view.getInt16(i * 2, true));
            pcm.push({samples, info, isArrayBuffer: buffer instanceof ArrayBuffer});
        });
        // Existing single-argument business listeners must still receive the PCM bytes.
        player.on('audio_segment', buffer => legacyPCM.push(Array.from(new Uint8Array(buffer))));
        player.on(mpegts.Events.ERROR, (...args) => errors.push(args));
        player.on(mpegts.Events.LOADING_COMPLETE, () => { window.done = true; });
        player.attachMediaElement(document.querySelector('#video'));
        player.load();
    }, enableWorker);
    await page.waitForFunction(() => window.done);
    return page.evaluate(() => {
        const result = {pcm, legacyPCM, errors, usesWorker: !!player._transmuxer._worker};
        player.destroy();
        return result;
    });
}

for (const enableWorker of [false, true]) {
    for (const {codec, bytes, samples} of [
        {codec: 7, bytes: [0xd5, 0x55, 0xaa, 0x2a], samples: [8, -8, 32256, -32256]},
        {codec: 8, bytes: [0xff, 0x7f, 0x80, 0x00], samples: [0, 0, 32124, -32124]}
    ]) {
        test(`G.711 codec ${codec} updates rate/channels per packet, Worker ${enableWorker}`, async ({page, context}, testInfo) => {
            const combinations = [[0, 1], [1, 2], [1, 1], [0, 2]];
            const packets = combinations.map(([rateIndex, channelCount]) => ({codec, bytes, rateIndex, channelCount}));
            const result = await receivePCM(page, context, testInfo, packets, enableWorker);
            expect(result.errors).toEqual([]);
            expect(result.usesWorker).toBe(enableWorker);
            expect(result.pcm).toEqual(combinations.map(([rateIndex, channelCount]) => ({
                samples, isArrayBuffer: true,
                info: {sampleRate: rateIndex === 0 ? 8000 : 16000, channelCount, format: 's16le'}
            })));
            const expectedBytes = samples.flatMap(sample => [sample & 0xff, (sample >> 8) & 0xff]);
            expect(result.legacyPCM).toEqual(combinations.map(() => expectedBytes));
        });
    }

    test(`G.711 rejects unknown rate indices and continues, Worker ${enableWorker}`, async ({page, context}, testInfo) => {
        const packets = [7, 8].flatMap(codec => [2, 3].map(rateIndex => ({
            codec, rateIndex, channelCount: 1, bytes: [0xd5, 0x55]
        })));
        packets.push({codec: 7, rateIndex: 1, channelCount: 2, bytes: [0xd5, 0x55]});
        const result = await receivePCM(page, context, testInfo, packets, enableWorker);
        expect(result.usesWorker).toBe(enableWorker);
        expect(result.errors).toEqual([2, 3, 2, 3].map(index => [
            'MediaError', 'FormatError', {code: -1, msg: `Flv: Unsupported G.711 sample rate idx: ${index}`}
        ]));
        expect(result.pcm).toEqual([{
            samples: [8, -8], isArrayBuffer: true,
            info: {sampleRate: 16000, channelCount: 2, format: 's16le'}
        }]);
        expect(result.legacyPCM).toEqual([[8, 0, 248, 255]]);
    });
}
