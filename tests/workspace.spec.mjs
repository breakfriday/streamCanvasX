import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';

const { version } = createRequire(import.meta.url)('../packages/playercore/package.json');

test.beforeEach(async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    window.failures = [];
    window.workers = [];
    window.addEventListener('error', event => failures.push(event.message));
    window.addEventListener('unhandledrejection', event => failures.push(String(event.reason)));
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        this.messages = [];
        this.addEventListener('message', event => this.messages.push(event.data.msg));
        workers.push(this);
      }
    };
  });
  await page.goto(`/tests/harness.html?format=${testInfo.project.name}`);
  await page.waitForFunction(() => window.loaded);
});

for (const enableWorker of [false, true]) {
  test(`re-exported local core plays FLV, worker=${enableWorker}`, async ({ page }) => {
    expect(await page.evaluate(() => api.streamcanvasCore.version)).toBe(version);
    await page.evaluate(enableWorker => {
      const core = api.streamcanvasCore;
      window.player = core.createPlayer({
        type: 'flv', url: '/packages/playercore/tests/fixtures/av.flv', isLive: false,
      }, { enableWorker, enableStashBuffer: false, lazyLoad: false });
      player.on(core.Events.ERROR, (...args) => failures.push(args));
      player.attachMediaElement(document.querySelector('#video'));
      player.load();
      player.play().catch(error => failures.push(error.message));
    }, enableWorker);
    await page.waitForFunction(() => document.querySelector('#video').currentTime > 0.2);
    expect(await page.evaluate(() => workers.length)).toBe(enableWorker ? 1 : 0);
    if (enableWorker) expect(await page.evaluate(() => workers[0].messages)).toContain('ready');
    await page.evaluate(() => player.destroy());
    expect(await page.evaluate(() => failures)).toEqual([]);
  });
}

test('upper player uses the local core and renders video to canvas', async ({ page }) => {
  await page.evaluate(() => {
    window.upper = api.createPlayerServiceInstance({
      url: new URL('/packages/playercore/tests/fixtures/av.flv', location.href).href,
      contentEl: document.querySelector('#player-root'),
      streamType: 'flv', isLive: true, hasAudio: true, hasVideo: true,
    });
    upper.createPlayer({});
    upper.corePlayer.on(api.streamcanvasCore.Events.ERROR, (...args) => failures.push(args));
  });
  await page.waitForFunction(() => upper.canvasVideoService.mediaView.nowFrameCount > 2);
  expect(await page.evaluate(() => upper.corePlayer instanceof api.streamcanvasCore.MSEPlayer)).toBe(true);
  expect(await page.evaluate(() => workers.length)).toBe(1);
  expect(await page.evaluate(() => workers[0].messages)).toContain('ready');
  expect(await page.evaluate(() => upper.audioEl.buffered.length > 0)).toBe(true);
  await page.evaluate(() => { clearInterval(window.audioProbe); upper.destroy(); });
  expect(await page.evaluate(() => failures)).toEqual([]);
});

test('PCM from local core reaches the upper AudioWorklet and analyser', async ({ page }) => {
  await page.evaluate(async () => {
    window.upper = api.createPlayerServiceInstance({
      url: new URL('/tests/av-pcm.flv', location.href).href,
      contentEl: document.querySelector('#player-root'),
      streamType: 'flv', isLive: true, hasAudio: true, hasVideo: true,
    });
    // Initialize output before this short local fixture finishes downloading.
    upper.initAudiPlayer();
  });
  await page.waitForFunction(() => upper._audioPlayer.hasInit);
  await page.evaluate(async () => {
    await upper._audioPlayer.audioContext.resume();
    window.pcm = [];
    window.audioPeak = 0;
    window.audioProbe = setInterval(() => {
      const analyser = upper._audioPlayer?.analyserNode;
      if (!analyser) return;
      const samples = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(samples);
      audioPeak = Math.max(audioPeak, ...samples.map(Math.abs));
    }, 10);
    // Exercise the core -> upper PCM output boundary without asking an empty
    // audio MediaSource to play. The legacy upper split-MSE path still does that.
    upper.corePlayer = api.streamcanvasCore.createPlayer({
      type: 'flv', url: new URL('/tests/av-pcm.flv', location.href).href, isLive: false,
    }, { enableWorker: true, enableStashBuffer: false, lazyLoad: false });
    upper.corePlayer.on('audio_segment', data => {
      pcm.push(data);
      const samples = new Int16Array(data);
      upper._audioPlayer.feedPCMDataBeta(Float32Array.from(samples, sample => Math.max(-1, Math.min(1, sample / 32768))));
    });
    upper.corePlayer.attachMediaElement(document.querySelector('#video'));
    upper.corePlayer.load();
    upper.corePlayer.play().catch(error => failures.push(error.message));
    upper.corePlayer.on(api.streamcanvasCore.Events.ERROR, (...args) => failures.push(args));
  });
  await page.waitForFunction(() => pcm.length > 0);
  expect(await page.evaluate(() => pcm.every(data => data instanceof ArrayBuffer))).toBe(true);
  await expect.poll(() => page.evaluate(() => ({ peak: audioPeak, state: upper._audioPlayer.audioContext.state, errors: failures }))).toMatchObject({ state: 'running', errors: [] });
  await page.waitForFunction(() => audioPeak > 0.001);
  expect(await page.evaluate(() => upper._audioPlayer.getWaveformHistory().length > 0)).toBe(true);
  await page.evaluate(() => { clearInterval(window.audioProbe); upper.destroy(); });
  expect(await page.evaluate(() => failures)).toEqual([]);
});
