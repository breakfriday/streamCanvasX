import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';

const { version } = createRequire(import.meta.url)('../package.json');

test.beforeEach(async ({ page }, testInfo) => {
    await page.addInitScript(() => {
        window.createdWorkers = [];
        const NativeWorker = window.Worker;
        window.Worker = class extends NativeWorker {
            constructor(...args) {
                super(...args);
                this.messages = [];
                this.addEventListener('message', event => this.messages.push(event.data.msg));
                window.createdWorkers.push(this);
            }
        };
    });
    await page.goto(`/packages/playercore/tests/harness.html?format=${testInfo.project.name}`);
    await page.waitForFunction(() => window.loaded);
});

async function startPlayer(page, fixture, enableWorker) {
    await page.evaluate(({fixture, enableWorker}) => {
        window.playerErrors = [];
        const isPCM = fixture === 'pcm.flv';
        window.player = mpegts.createPlayer({
            type: fixture.endsWith('.mpegts') ? 'mpegts' : 'flv',
            url: `/packages/playercore/tests/fixtures/${fixture}`,
            isLive: false,
            hasAudio: true,
            hasVideo: !isPCM
        }, {enableWorker, enableStashBuffer: false, lazyLoad: false});
        player.on(mpegts.Events.ERROR, (...error) => playerErrors.push(error));
        window.pcmSegments = [];
        player.on('audio_segment', buffer => pcmSegments.push(buffer));
        player.attachMediaElement(document.querySelector('#video'));
        player.load();
        if (!isPCM) player.play().catch(error => playerErrors.push(error.message));
    }, {fixture, enableWorker});
}

async function destroyPlayer(page) {
    await page.evaluate(() => {
        player.destroy();
        window.player = null;
    });
}

for (const fixture of ['av.flv', 'av.mpegts']) {
    for (const enableWorker of [false, true]) {
        test(`${fixture} plays with Worker ${enableWorker}`, async ({ page }) => {
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            expect(await page.evaluate(() => mpegts.version)).toBe(version);
            await startPlayer(page, fixture, enableWorker);
            await page.waitForFunction(() => {
                if (playerErrors.length) throw new Error(JSON.stringify(playerErrors));
                return document.querySelector('#video').currentTime > 0.2;
            });
            expect(await page.evaluate(() => playerErrors)).toEqual([]);
            expect(await page.evaluate(() => createdWorkers.length)).toBe(enableWorker ? 1 : 0);
            if (enableWorker) {
                expect(await page.evaluate(() => createdWorkers[0].messages)).toContain('media_segment');
            }
            await destroyPlayer(page);
            if (enableWorker) {
                await page.waitForFunction(() => createdWorkers[0].messages.includes('destroyed'));
            }
            // Recreating the public player exercises cleanup and initialization twice.
            await startPlayer(page, fixture, enableWorker);
            await page.waitForFunction(() => document.querySelector('#video').currentTime > 0.2);
            await destroyPlayer(page);
            expect(errors).toEqual([]);
        });
    }
}

for (const enableWorker of [false, true]) {
    test(`PCM samples are delivered with Worker ${enableWorker}`, async ({ page }) => {
        await startPlayer(page, 'pcm.flv', enableWorker);
        await page.waitForFunction(() => pcmSegments.length > 0);
        expect(await page.evaluate(() => {
            const samples = new Int16Array(pcmSegments[0]);
            return pcmSegments[0] instanceof ArrayBuffer && samples.some(value => value !== 0);
        })).toBe(true);
        expect(await page.evaluate(() => playerErrors)).toEqual([]);
        await destroyPlayer(page);
    });
}

test('asynchronous Worker startup error falls back and replays load', async ({ page }) => {
    await page.evaluate(() => {
        window.Worker = class extends EventTarget {
            constructor() {
                super();
                setTimeout(() => this.dispatchEvent(new ErrorEvent('error', {message: 'Simulated startup failure'})), 20);
            }
            postMessage() {}
            terminate() { window.failedWorkerTerminated = true; }
        };
    });
    await startPlayer(page, 'av.flv', true);
    await page.waitForFunction(() => document.querySelector('#video').currentTime > 0.2);
    expect(await page.evaluate(() => failedWorkerTerminated)).toBe(true);
    expect(await page.evaluate(() => playerErrors)).toEqual([]);
    await destroyPlayer(page);
});
