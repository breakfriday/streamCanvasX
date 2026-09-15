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
    upper.audioProcessingService.init(upper, {media_el: document.querySelector('#video')});
    upper.audioProcessingService.initCanvas();
    // This local file arrives in a burst. Prepare output first so this test
    // exercises PCM transport/playback; startup drops are tested separately.
    await upper.initAudiPlayer().initPromise;
    await upper._audioPlayer.play();
  });
  await page.evaluate(async () => {
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
    upper.corePlayer.on('audio_segment', (data, info) => {
      pcm.push(data);
      upper.handleAudioSegment(data, info);
    });
    upper.corePlayer.attachMediaElement(document.querySelector('#video'));
    upper.corePlayer.load();
    upper.corePlayer.play().catch(error => failures.push(error.message));
    upper.corePlayer.on(api.streamcanvasCore.Events.ERROR, (...args) => failures.push(args));
  });
  await page.waitForFunction(() => pcm.length > 0 && upper._audioPlayer.hasInit);
  await page.evaluate(() => upper._audioPlayer.play());
  expect(await page.evaluate(() => pcm.every(data => data instanceof ArrayBuffer))).toBe(true);
  await expect.poll(() => page.evaluate(() => ({ peak: audioPeak, state: upper._audioPlayer.audioContext.state, errors: failures }))).toMatchObject({ state: 'running', errors: [] });
  await page.waitForFunction(() => audioPeak > 0.001);
  expect(await page.evaluate(() => upper._audioPlayer.getWaveformHistory().length > 0)).toBe(true);
  await page.evaluate(() => { clearInterval(window.audioProbe); upper.destroy(); });
  expect(await page.evaluate(() => failures)).toEqual([]);
});

test('decorator metadata, constructor injection and method decorators survive the toolchain', async ({page}) => {
  const result = await page.evaluate(() => {
    const upper = api.createPlayerServiceInstance({
      url: '/unused.flv', contentEl: document.querySelector('#player-root'), streamType: 'flv',
    });
    const fields = [
      'httpFlvStreamService', 'flvVDemuxService', 'webcodecsDecoderService',
      'canvasVideoService', 'debugLogService', 'fLVDemuxStream',
      'audioProcessingService', 'wasmDecoderService', 'canvasToVideoSerivce',
      'mseDecoderService', 'preProcessing', 'renderEngine', 'rtcPlayerService'
    ];
    const types = Reflect.getMetadata('design:paramtypes', upper.constructor);
    const injectableTypes = Reflect.getMetadata('inversify:paramtypes', upper.constructor);
    const tags = Reflect.getMetadata('inversify:tagged', upper.constructor);
    const metadata = fields.map((field, index) => ({
      field,
      matchesType: typeof types?.[index] === 'function' && upper[field] instanceof types[index],
      injectable: injectableTypes?.[index] === types?.[index],
      hasInjectToken: tags?.[index]?.some(tag => tag.key === 'inject' && typeof tag.value === 'symbol') === true,
    }));
    const corrected = upper.correctConfig({streamType: 'MPEG-TS', hasAudio: false, fftsize: undefined});
    const nestedInjection = !!upper.renderEngine.waveGl && !!upper.rtcPlayerService.videoService;
    upper.destroy();
    return {metadata, nestedInjection, corrected, failures};
  });
  expect(result.metadata).toHaveLength(13);
  for (const parameter of result.metadata) {
    expect(parameter, parameter.field).toMatchObject({matchesType: true, injectable: true, hasInjectToken: true});
  }
  expect(result.nestedInjection).toBe(true);
  expect(result.corrected).toMatchObject({streamType: 'MPEG-TS', hasAudio: false, isLive: false, hasControl: true, fftsize: 128});
  expect(result.failures).toEqual([]);
});

test('typed emitter preserves context, once cancellation and listener cleanup', async ({page}) => {
  const result = await page.evaluate(() => {
    const upper = api.createPlayerServiceInstance({
      url: '/unused.flv', contentEl: document.querySelector('#player-root'), streamType: 'flv',
    });
    const Emitter = Object.getPrototypeOf(upper.constructor.prototype).constructor;
    const emitter = new Emitter();
    const calls = [];
    const ctx = {label: 'context'};
    function listener(value) { calls.push(`${this.label}:${value}`); }
    const chained = emitter.on('data', listener, ctx) === emitter;
    emitter.emit('data', 1);
    emitter.off('data', listener);
    emitter.emit('data', 2);
    emitter.once('data', listener, ctx);
    emitter.emit('data', 3);
    emitter.emit('data', 4);
    emitter.once('data', listener, ctx);
    emitter.off('data', listener); // The original callback cancels the once wrapper.
    emitter.emit('data', 5);
    const event = Symbol('data');
    emitter.on(event, listener, ctx);
    emitter.emit(event, 6);
    emitter.off(event);
    emitter.emit(event, 7);
    emitter.on('data', listener, ctx);
    const cleared = emitter.off();
    emitter.emit('data', 8);
    upper.destroy();
    return {calls, chained, clearReturnsUndefined: cleared === undefined, failures};
  });
  expect(result).toEqual({
    calls: ['context:1', 'context:3', 'context:6'], chained: true,
    clearReturnsUndefined: true, failures: []
  });
});
