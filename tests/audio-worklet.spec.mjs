import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Execute the production processor with deterministic render quanta. Browser tests
// below additionally check the actual AudioWorklet graph in source and bundle modes.
const source = readFileSync(new URL('../packages/player/src/services/player/audioWorkLetPlayer.ts', import.meta.url), 'utf8');
const code = source.match(/const workletCode = `([\s\S]*?)`;/)[1];
function processor(rate = 16000) {
    let Processor;
    vm.runInNewContext(code, {
        AudioWorkletProcessor: class { constructor() { this.port = {}; } },
        sampleRate: rate,
        registerProcessor: (_name, ctor) => { Processor = ctor; }
    });
    return new Processor();
}
function render(p, length) {
    const output = [new Float32Array(length), new Float32Array(length)];
    p.process([], [output]);
    return output.map(channel => Array.from(channel));
}

test('processor outputs original samples across stereo packet/quanta boundaries', () => {
    const p = processor();
    p.enqueue({pcm: Float32Array.from([0, 0, 0.3]), sampleRate: 16000, channelCount: 2});
    p.enqueue({pcm: Float32Array.from([-0.6, 0.6, -0.3, 0.9, 0]), sampleRate: 16000, channelCount: 2});
    const a = render(p, 1);
    const b = render(p, 5);
    const left = [...a[0], ...b[0]];
    const right = [...a[1], ...b[1]];
    [0, .3, .6, .9, 0, 0].forEach((value, i) => expect(left[i]).toBeCloseTo(value, 5));
    [0, -.6, -.3, 0, 0, 0].forEach((value, i) => expect(right[i]).toBeCloseTo(value, 5));
    // A partially filled render quantum must remain audible, with silence after it.
    expect(render(p, 4)).toEqual([[0, 0, 0, 0], [0, 0, 0, 0]]);
    p.enqueue({pcm: Float32Array.from([.5, .5]), sampleRate: 16000, channelCount: 1});
    expect(render(p, 1)).toEqual([[.5], [.5]]);
});

test('processor caps backlog at two seconds of frames, even for one oversized stereo packet', () => {
    const p = processor();
    const pcm = new Float32Array(16000 * 2 * 3);
    pcm.fill(-.5, 0, 16000 * 2);
    pcm.fill(.25, 16000 * 2);
    p.enqueue({pcm, sampleRate: 16000, channelCount: 2});
    expect(p.totalFrames).toBe(32000);
    expect(render(p, 1)).toEqual([[.25], [.25]]);
    p.enqueue({pcm: Float32Array.from([.75, .75]), sampleRate: 16000, channelCount: 1});
    expect(p.totalFrames).toBe(2);
    expect(render(p, 1)).toEqual([[.75], [.75]]);
});

test.beforeEach(async ({page}, testInfo) => {
    await page.goto(`/tests/harness.html?format=${testInfo.project.name}`);
    await page.waitForFunction(() => window.loaded);
    await page.evaluate(() => {
        window.failures = [];
        window.pcmPosts = 0;
        const NativeWorkletNode = window.AudioWorkletNode;
        window.AudioWorkletNode = class extends NativeWorkletNode {
            constructor(...args) {
                super(...args);
                const postMessage = this.port.postMessage.bind(this.port);
                this.port.postMessage = (...args) => { pcmPosts++; postMessage(...args); };
            }
        };
        window.addEventListener('unhandledrejection', e => failures.push(String(e.reason)));
        window.addEventListener('error', e => failures.push(e.message));
        window.upper = api.createPlayerServiceInstance({
            url: '/unused.flv', contentEl: document.querySelector('#player-root'), streamType: 'flv',
            isLive: true, hasAudio: true, hasVideo: false, isMuted: false,
        });
        upper.audioProcessingService.init(upper, {media_el: document.querySelector('#video')});
        upper.audioProcessingService.initCanvas();
        window.feedTone = (sampleRate, channelCount) => {
            const bytes = new ArrayBuffer(sampleRate * channelCount * 2);
            const view = new DataView(bytes);
            for (let frame = 0; frame < sampleRate; frame++) {
                for (let channel = 0; channel < channelCount; channel++) {
                    const hz = channel === 0 ? 440 : 880;
                    view.setInt16((frame * channelCount + channel) * 2,
                        Math.round(16000 * Math.sin(2 * Math.PI * hz * frame / sampleRate)), true);
                }
            }
            upper.handleAudioSegment(bytes, {sampleRate, channelCount, format: 's16le'});
        };
        window.connectProbe = () => {
            const player = upper._audioPlayer;
            const splitter = player.audioContext.createChannelSplitter(2);
            player.workletNode.connect(splitter);
            window.probes = [0, 1].map(channel => {
                const analyser = player.audioContext.createAnalyser();
                analyser.fftSize = 2048;
                analyser.smoothingTimeConstant = 0;
                splitter.connect(analyser, channel);
                return analyser;
            });
        };
        window.tones = () => probes.map(analyser => {
            const bins = new Float32Array(analyser.frequencyBinCount);
            analyser.getFloatFrequencyData(bins);
            const peak = Math.max(...bins);
            return peak > -50 ? bins.indexOf(peak) * upper._audioPlayer.audioContext.sampleRate / analyser.fftSize : 0;
        });
    });
});

for (const rate of [8000, 16000]) {
    for (const channels of [1, 2]) {
        test(`upper plays ${rate} Hz, ${channels} channels at correct pitches, dropping packets before initialization`, async ({page}) => {
            const dropped = await page.evaluate(({rate, channels}) => {
                feedTone(rate, channels);
                const info = {sampleRate: rate, channelCount: channels, format: 's16le'};
                return [
                    upper._audioPlayer.feedPCMData(new ArrayBuffer(4), info),
                    upper._audioPlayer.feedPCMDataBeta(new Float32Array(2), info)
                ];
            }, {rate, channels});
            expect(dropped).toEqual([false, false]);
            await page.waitForFunction(() => upper._audioPlayer.hasInit);
            expect(await page.evaluate(() => pcmPosts)).toBe(0);
            expect(await page.evaluate(() => upper._audioPlayer.audioContext.sampleRate)).toBe(rate);
            await page.evaluate(async ({rate, channels}) => {
                connectProbe();
                await upper._audioPlayer.play();
                feedTone(rate, channels);
            }, {rate, channels});
            expect(await page.evaluate(() => pcmPosts)).toBe(1);
            await expect.poll(() => page.evaluate(() => tones().map(Math.round))).toEqual(
                channels === 2 ? [rate === 8000 ? 441 : 438, rate === 8000 ? 879 : 883] : Array(2).fill(rate === 8000 ? 441 : 438)
            );
            await page.evaluate(() => upper.destroy());
            expect(await page.evaluate(() => failures)).toEqual([]);
        });
    }
}

test('rate switches recreate audio output at the PCM rate and close the old context', async ({page}) => {
    await page.evaluate(() => { feedTone(8000, 1); window.previousContext = upper._audioPlayer.audioContext; });
    await page.waitForFunction(() => upper._audioPlayer.hasInit);
    await page.evaluate(async () => { connectProbe(); await upper._audioPlayer.play(); feedTone(8000, 1); });
    await expect.poll(() => page.evaluate(() => tones().map(Math.round))).toEqual([441, 441]);
    await page.evaluate(() => {
        upper._audioPlayer.mute(true);
        feedTone(16000, 2);
    });
    await page.waitForFunction(() => upper._audioPlayer.hasInit);
    expect(await page.evaluate(() => ({
        rate: upper._audioPlayer.audioContext.sampleRate,
        oldState: previousContext.state,
        sameContext: upper._audioPlayer.audioContext === previousContext,
        muted: upper._audioPlayer.gainNode.gain.value === 0
    }))).toEqual({rate: 16000, oldState: 'closed', sameContext: false, muted: true});
    await page.evaluate(async () => { connectProbe(); await upper._audioPlayer.play(); feedTone(16000, 2); });
    await expect.poll(() => page.evaluate(() => tones().map(Math.round))).toEqual([438, 883]);
    // A channel-only change keeps the context and resets the old stereo queue.
    await page.evaluate(() => { window.context = upper._audioPlayer.audioContext; feedTone(16000, 1); });
    await expect.poll(() => page.evaluate(() => tones().map(Math.round))).toEqual([438, 438]);
    expect(await page.evaluate(() => upper._audioPlayer.audioContext === window.context)).toBe(true);
    await page.evaluate(() => upper.destroy());
    expect(await page.evaluate(() => failures)).toEqual([]);
});

test('destroy while addModule is pending cannot recreate nodes or start waveform timers', async ({page}) => {
    await page.evaluate(() => {
        const NativeContext = window.AudioContext;
        window.AudioContext = class extends NativeContext {
            constructor(...args) {
                super(...args);
                const addModule = this.audioWorklet.addModule.bind(this.audioWorklet);
                this.audioWorklet.addModule = async url => {
                    await addModule(url);
                    await new Promise(resolve => { window.releaseModule = resolve; });
                };
            }
        };
        feedTone(16000, 2);
        window.audioPlayer = upper._audioPlayer;
        window.pcmContext = audioPlayer.audioContext;
    });
    await page.waitForFunction(() => !!window.releaseModule);
    await page.evaluate(async () => {
        upper.destroy();
        releaseModule();
        await audioPlayer.initPromise;
    });
    expect(await page.evaluate(() => ({
        initialized: audioPlayer.hasInit, node: audioPlayer.workletNode,
        posts: pcmPosts, timer: audioPlayer.timeId ?? null,
        state: pcmContext.state, failures
    }))).toEqual({initialized: false, node: null, posts: 0, timer: null, state: 'closed', failures: []});
});
