import {test, expect} from '@playwright/test';

test.beforeEach(async ({page}, testInfo) => {
    await page.goto(`/tests/harness.html?format=${testInfo.project.name}`);
    await page.waitForFunction(() => window.loaded);
    await page.clock.install();
    await page.evaluate(() => {
        window.upper = api.createPlayerServiceInstance({
            url: '/unused.flv', contentEl: document.querySelector('#player-root'),
            streamType: 'flv', isLive: true, hasAudio: true, hasVideo: false,
        });
        // Isolate output health from network throughput in these offline tests.
        clearInterval(upper.lowSpeedTimer);
        upper.audioEl = document.querySelector('#video');
        upper.audioProcessingService.init(upper, {media_el: upper.audioEl});
        upper.audioProcessingService.initCanvas();
        window.reloads = [];
        upper.addReloadTask = reason => reloads.push(reason);
        window.feedPCM = () => upper.handleAudioSegment(new ArrayBuffer(1600), {
            sampleRate: 8000, channelCount: 1, format: 's16le',
        });
    });
});

test('switching to PCM cancels an existing DOM watchdog and error listener', async ({page}) => {
    await page.evaluate(() => {
        upper.audioEvent();
        Object.defineProperty(upper.audioEl, 'error', {value: {code: 2}});
        upper.audioEl.dispatchEvent(new Event('error'));
    });
    expect(await page.evaluate(() => reloads.length)).toBe(1);
    await page.evaluate(() => { reloads.length = 0; });
    await page.clock.fastForward(5000);
    await page.clock.fastForward(14000);
    await page.evaluate(async () => {
        feedPCM();
        await upper._audioPlayer.initPromise;
        upper.audioEvent();
        upper.audioEl.dispatchEvent(new Event('error'));
    });
    await page.clock.fastForward(25000);
    expect(await page.evaluate(() => ({mode: upper.audioPlaybackMode, reloads})))
        .toEqual({mode: 'audioContext', reloads: []});
    await page.evaluate(() => upper.destroy());
});

test('DOM audio detects starvation once per recovery window and cleans up on destroy', async ({page}) => {
    await page.evaluate(() => { upper.audioEvent(); upper.audioEvent(); });
    await page.clock.fastForward(5000);
    await page.clock.fastForward(15001);
    expect(await page.evaluate(() => reloads.length)).toBe(1);
    await page.clock.fastForward(5000);
    expect(await page.evaluate(() => reloads.length)).toBe(1);
    await page.evaluate(() => {
        Object.defineProperty(upper.audioEl, 'error', {value: {code: 2}});
        upper.audioEl.dispatchEvent(new Event('error'));
    });
    expect(await page.evaluate(() => reloads.length)).toBe(2);
    await page.evaluate(() => {
        window.oldAudio = upper.audioEl;
        upper.destroy();
        oldAudio.dispatchEvent(new Event('error'));
    });
    await page.clock.fastForward(30000);
    expect(await page.evaluate(() => reloads.length)).toBe(2);
});

test('PCM recovery needs recent submitted data and a running context; mixed streams still need video', async ({page}) => {
    await page.evaluate(async () => {
        feedPCM();
        await upper._audioPlayer.initPromise;
        await upper._audioPlayer.play();
    });
    expect(await page.evaluate(() => upper.checkPlaying())).toBe(false);
    await page.evaluate(() => feedPCM());
    // All-zero PCM is valid; the unused audio DOM stays at readyState 0.
    expect(await page.evaluate(() => upper.checkPlaying())).toBe(true);
    await page.evaluate(() => upper._audioPlayer.pause());
    expect(await page.evaluate(() => upper.checkPlaying())).toBe(false);
    await page.evaluate(() => upper._audioPlayer.play());
    await page.clock.fastForward(15001);
    expect(await page.evaluate(() => upper.checkPlaying())).toBe(false);
    await page.evaluate(() => {
        feedPCM();
        upper.mediaInfo = {hasVideo: true, hasAudio: true};
        upper.meidiaEl = document.createElement('video');
    });
    expect(await page.evaluate(() => upper.checkPlaying())).toBe(false);
    await page.evaluate(() => {
        Object.defineProperties(upper.meidiaEl, {
            readyState: {value: 4}, paused: {value: false}, ended: {value: false},
        });
    });
    expect(await page.evaluate(() => upper.checkPlaying())).toBe(true);
    await page.evaluate(() => upper.destroy());
    expect(await page.evaluate(() => upper.checkPlaying())).toBe(false);
});

test('video watchdog skips audio-only streams but still checks video with PCM audio', async ({page}) => {
    await page.evaluate(async () => {
        feedPCM();
        await upper._audioPlayer.initPromise;
        window.view = upper.canvasVideoService.mediaView;
        view.load(document.querySelector('#video'));
        view.video.dispatchEvent(new Event('loadeddata'));
    });
    await page.clock.fastForward(10000);
    expect(await page.evaluate(() => reloads.length)).toBe(0);
    await page.evaluate(() => {
        upper.mediaInfo = {hasVideo: true, hasAudio: true};
        view.video.dispatchEvent(new Event('loadeddata'));
    });
    await page.clock.fastForward(10000);
    expect(await page.evaluate(() => reloads)).toEqual([
        {arr_msg: ['---fps 調用鏈檢查異常 ----']},
    ]);
    await page.evaluate(() => { upper.mediaInfo = {hasVideo: false, hasAudio: true}; });
    await page.clock.fastForward(20000);
    expect(await page.evaluate(() => reloads.length)).toBe(1);
    await page.evaluate(() => upper.destroy());
});

for (const pcmFirst of [true, false]) {
    test(`audio-only detection stops video checks, PCM first=${pcmFirst}`, async ({page}) => {
        await page.evaluate(async pcmFirst => {
            upper.config.hasVideo = true;
            const prototype = api.streamcanvasCore.MSEPlayer.prototype;
            const load = prototype.load;
            // Install the real upper event handlers without connecting a network stream.
            prototype.load = () => {};
            try { upper.createPlayer({}); } finally { prototype.load = load; }
            window.view = upper.canvasVideoService.mediaView;
            window.video = upper.meidiaEl;
            video.dispatchEvent(new Event('loadeddata'));
            if (pcmFirst) {
                feedPCM();
                await upper._audioPlayer.initPromise;
                // Exercise the previously skipped branch when the waveform was already visible.
                upper.config.showAudio = true;
            }
            upper.corePlayer._emitter.emit(api.streamcanvasCore.Events.MEDIA_INFO, {
                metadata: {}, hasAudio: true, hasVideo: false,
            });
            if (!pcmFirst) {
                feedPCM();
                await upper._audioPlayer.initPromise;
            }
            // A late DOM event must not restart video checks.
            video.dispatchEvent(new Event('loadeddata'));
        }, pcmFirst);
        await page.clock.fastForward(30000);
        expect(await page.evaluate(() => ({
            video: upper.hasVideoTrack, mode: upper.audioPlaybackMode, timer: view.timer, reloads,
        }))).toEqual({video: false, mode: 'audioContext', timer: null, reloads: []});
        await page.evaluate(() => upper.destroy());
    });
}
