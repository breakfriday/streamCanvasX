import {test, expect} from '@playwright/test';

test.beforeEach(async ({page}, info) => {
    await page.addInitScript(() => {
        window.errors = []; window.mseCreated = 0; window.workerCreated = 0; window.workerTerminated = 0;
        addEventListener('error', event => errors.push(event.message));
        addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
        const MSE = MediaSource, WorkerBase = Worker;
        window.MediaSource = class extends MSE { constructor(...args) { super(...args); mseCreated++; } };
        window.Worker = class extends WorkerBase {
            constructor(...args) { super(...args); workerCreated++; }
            terminate() { workerTerminated++; return super.terminate(); }
        };
    });
    await page.goto(`/tests/harness.html?format=${info.project.name}`);
    await page.waitForFunction(() => window.loaded);
});

for (const mode of [undefined, false]) {
    test(`public factory keeps MSE when webcodecs=${mode}`, async ({page}) => {
        await page.evaluate(mode => {
            window.player = api.createPlayerServiceInstance({url: '/packages/playercore/tests/fixtures/av.flv',
                contentEl: document.querySelector('#player-root'), isLive: false, webcodecs: mode});
            player.createPlayer({});
        }, mode);
        await page.waitForFunction(() => mseCreated === 2);
        expect(await page.evaluate(() => player.config.webcodecs)).toBe(false);
        await page.evaluate(() => player.destroy());
        expect(await page.evaluate(() => errors)).toEqual([]);
    });
}

test('public WebCodecs factory renders without MSE, reports statistics and recreates cleanly', async ({page}) => {
    await page.evaluate(() => {
        window.player = api.createPlayerServiceInstance({url: '/packages/playercore/tests/fixtures/av.flv',
            contentEl: document.querySelector('#player-root'), isLive: false, webcodecs: true});
        player.on('webcodecsError', error => errors.push(error.message));
        window.backend = null;
        player.on('webcodecsRender', data => backend = data.backend);
    });
    expect(await page.evaluate(() => ({mseCreated, workerCreated}))).toEqual({mseCreated: 0, workerCreated: 0});
    for (let run = 0; run < 2; run++) {
        await page.evaluate(() => player.createPlayer({}));
        await page.waitForFunction(() => player.webcodecsStatistics?.counts.rendered > 0);
        expect(await page.evaluate(() => backend)).toBe('webgl');
        expect(await page.evaluate(() => mseCreated)).toBe(0);
        await expect(page.locator('#player-root canvas')).toHaveCount(1);
        await page.evaluate(() => {player.destroy(); player.destroy();});
        await expect(page.locator('#player-root canvas')).toHaveCount(0);
    }
    expect(await page.evaluate(() => workerCreated)).toBe(2);
    expect(await page.evaluate(() => workerTerminated)).toBe(2);
    expect(await page.evaluate(() => errors)).toEqual([]);
});

test('public WebCodecs factory cancels initialization and reports invalid input without fallback', async ({page}) => {
    await page.evaluate(() => {
        const root = document.querySelector('#player-root');
        const cancelled = api.createPlayerServiceInstance({url: '/packages/playercore/tests/fixtures/av.flv',
            contentEl: root, webcodecs: true});
        cancelled.createPlayer({}); cancelled.destroy();
        window.failure = null;
        window.player = api.createPlayerServiceInstance({url: '/invalid.ts', contentEl: root,
            webcodecs: true, streamType: 'MPEG-TS'});
        player.on('webcodecsError', error => failure = error.message);
        player.createPlayer({});
    });
    await page.waitForFunction(() => failure !== null);
    expect(await page.evaluate(() => failure)).toContain('FLV');
    expect(await page.evaluate(() => ({mseCreated, workerCreated}))).toEqual({mseCreated: 0, workerCreated: 0});
    await expect(page.locator('#player-root canvas')).toHaveCount(0);
    expect(await page.evaluate(() => errors)).toEqual([]);
});

test('live WebCodecs retries network failure, resumes frames and cancels EOF retry on destroy', async ({page}) => {
    let requests = 0;
    await page.route('**/reconnecting.flv', async route => {
        if (++requests === 1) await route.abort('connectionreset');
        else await route.fulfill({path: 'packages/playercore/tests/fixtures/av.flv', contentType: 'video/x-flv'});
    });
    await page.evaluate(() => {
        window.retries = []; window.rendered = 0;
        window.player = api.createPlayerServiceInstance({url: '/reconnecting.flv',
            contentEl: document.querySelector('#player-root'), isLive: true, webcodecs: true});
        player.on('webcodecsError', error => errors.push(error.message));
        player.on('webcodecsReconnect', data => retries.push(data));
        player.on('webcodecsComplete', stats => rendered += stats.counts.decoded);
        player.createPlayer({});
    });
    await page.waitForFunction(() => retries.length === 1);
    expect(await page.evaluate(() => retries[0].delayMs)).toBe(2000);
    await page.waitForFunction(() => rendered > 0 && retries.length >= 2);
    expect(requests).toBe(2);
    expect(await page.evaluate(() => mseCreated)).toBe(0);
    await page.evaluate(() => player.destroy());
    await page.waitForTimeout(2300);
    expect(requests).toBe(2);
    await expect(page.locator('#player-root canvas')).toHaveCount(0);
    expect(await page.evaluate(() => errors)).toEqual([]);
});

test('WebCodecs stop callback prevents retry and finite-file failures remain terminal', async ({page}) => {
    let requests = 0;
    await page.route('**/offline.flv', async route => { requests++; await route.abort(); });
    await page.evaluate(() => {
        window.stopped = false;
        window.player = api.createPlayerServiceInstance({url: '/offline.flv',
            contentEl: document.querySelector('#player-root'), isLive: true, webcodecs: true,
            stopCallBack: async () => ({stop: true, message: '设备已离线，停止重连'})});
        player.on('webcodecsStatus', message => { if (message.includes('停止重连')) stopped = true; });
        player.createPlayer({});
    });
    await page.waitForFunction(() => stopped);
    await page.waitForTimeout(2200);
    expect(requests).toBe(1);
    await page.evaluate(() => {
        player.destroy(); window.terminal = false;
        window.player = api.createPlayerServiceInstance({url: '/offline.flv',
            contentEl: document.querySelector('#player-root'), isLive: false, webcodecs: true});
        player.on('webcodecsError', () => terminal = true);
        player.createPlayer({});
    });
    await page.waitForFunction(() => terminal);
    await page.waitForTimeout(2200);
    expect(requests).toBe(2);
    expect(await page.evaluate(() => errors)).toEqual([]);
});
