import { test as base, expect } from '@playwright/test';

const test = base.extend({
    lifecyclePage: async ({page}, use, testInfo) => {
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`/packages/playercore/tests/harness.html?format=${testInfo.project.name}`);
        await page.waitForFunction(() => window.loaded);
        await page.evaluate(() => {
            window.makePlayer = (options = {}) => {
                const {splitAVBuffers = false, ...config} = options;
                window.player = mpegts.createPlayer({
                    type: 'flv', url: '/packages/playercore/tests/fixtures/av.flv', splitAVBuffers
                }, {enableStashBuffer: false, lazyLoad: false, ...config});
                window.playerErrors = [];
                player.on(mpegts.Events.ERROR, (...args) => playerErrors.push(args));
                player.attachMediaElement(document.querySelector('#video'),
                    splitAVBuffers ? document.querySelector('#audio') : undefined);
                return player;
            };
        });
        await use(page);
        expect(errors).toEqual([]);
    }
});

async function waitForPlayback(page) {
    await page.waitForFunction(() => {
        if (playerErrors.length) throw new Error(JSON.stringify(playerErrors));
        const video = document.querySelector('#video');
        const audio = document.querySelector('#audio');
        return video.currentTime > 0.2 && (!player.splitAVBuffers || audio.currentTime > 0.2);
    });
}

const modes = [
    {enableWorker: false, splitAVBuffers: false},
    {enableWorker: true, splitAVBuffers: false},
    {enableWorker: true, splitAVBuffers: true}
];
for (const mode of modes) {
    test.describe(`Worker ${mode.enableWorker}, split ${mode.splitAVBuffers}`, () => {
        test('unload cancels load pending sourceopen, then explicit load still works', async ({lifecyclePage: page}) => {
            let requests = 0;
            page.on('request', request => { if (request.url().endsWith('/av.flv')) requests++; });
            await page.evaluate(mode => {
                makePlayer(mode);
                player.load();
                player.unload();
                player.unload();
            }, mode);
            await page.waitForFunction(() => player._mseSourceOpened);
            expect(requests).toBe(0);
            expect(await page.evaluate(() => player._transmuxer)).toBeNull();
            await page.evaluate(() => { player.load(); player.play(); });
            await waitForPlayback(page);
            expect(requests).toBe(1);
            await page.evaluate(() => player.destroy());
        });

        test('only the latest reload starts, old sourceopen and media callbacks are ignored', async ({lifecyclePage: page}) => {
            await page.evaluate(mode => { makePlayer(mode); player.load(); player.play(); }, mode);
            await waitForPlayback(page);
            let requests = 0;
            page.on('request', request => { if (request.url().endsWith('/av.flv')) requests++; });
            await page.evaluate(() => {
                const oldSourceOpen = player._msectl._emitter.listeners('source_open')[0];
                const oldSegment = player._transmuxer._emitter.listeners('media_segment')[0];
                const oldCanPlay = player.e.onvCanPlay;
                player.reload();
                player.safeReolad();
                player.reload();
                // Simulate callbacks that were queued by an earlier attachment/load.
                oldSourceOpen();
                oldSegment('video', {});
                oldCanPlay();
                if (player._mseSourceOpened || player._receivedCanPlay || player._transmuxer) {
                    throw new Error('An obsolete callback changed the new attachment');
                }
            });
            await waitForPlayback(page);
            expect(requests).toBe(1);
            await page.evaluate(() => { player.destroy(); player.destroy(); });
        });

        test('unload and destroy cancel pending reloads', async ({lifecyclePage: page}) => {
            await page.clock.install();
            let requests = 0;
            page.on('request', request => { if (request.url().endsWith('/av.flv')) requests++; });
            await page.evaluate(mode => {
                makePlayer(mode);
                player.reload();
                player.unload();
            }, mode);
            await page.waitForFunction(() => player._mseSourceOpened);
            expect(requests).toBe(0);
            await page.evaluate(() => {
                window.destroyNotifications = 0;
                player.on(mpegts.Events.DESTROYING, () => {
                    destroyNotifications++;
                    player.destroy();
                });
                player.safeReolad();
                player.destroy();
                player.destroy();
                player.unload();
                player.detachMediaElement();
                player.pause();
            });
            // Detect the former one-second reload timer running after destruction.
            await page.clock.runFor(1100);
            expect(requests).toBe(0);
            expect(await page.evaluate(() => ({
                destroyed: destroyNotifications,
                video: player._mediaElement, audio: player._audioMeidaElement,
                videoSource: document.querySelector('#video').getAttribute('src'),
                audioSource: document.querySelector('#audio').getAttribute('src')
            }))).toEqual({destroyed: 1, video: null, audio: null, videoSource: null, audioSource: null});
        });

        test('unload cancels seek and buffering timers, including across a new load', async ({lifecyclePage: page}) => {
            await page.evaluate(mode => { makePlayer(mode); player.load(); player.play(); }, mode);
            await waitForPlayback(page);
            await page.clock.install();
            await page.evaluate(() => {
                window.staleSeekCalls = 0;
                window.staleProgressCalls = 0;
                // Exercise the scheduling paths without relying on a browser-generated seek timing.
                player._requestSetTime = false;
                const originalBufferedCheck = player._isTimepointBuffered;
                player._isTimepointBuffered = () => false;
                player._onvSeeking();
                player._isTimepointBuffered = originalBufferedCheck;
                player._suspendTransmuxer();
                player._checkAndApplyUnbufferedSeekpoint = () => staleSeekCalls++;
                player._checkProgressAndResume = () => staleProgressCalls++;
                player.unload();
                player.load();
            });
            await page.clock.runFor(1100);
            expect(await page.evaluate(() => [staleSeekCalls, staleProgressCalls])).toEqual([0, 0]);
            await page.evaluate(() => player.destroy());
        });
    });
}

test('decode error listener is opt-in, idempotent, and removed on detach', async ({lifecyclePage: page}) => {
    await page.evaluate(() => {
        makePlayer();
        player.load();
        const video = document.querySelector('#video');
        window.recoveries = 0;
        player.deCodeError = () => recoveries++;
        Object.defineProperty(video, 'error', {configurable: true, value: {code: 3, message: 'test'}});
        video.dispatchEvent(new Event('error'));
        if (recoveries !== 0) throw new Error('Recovery was enabled without defatulEvent');
        player.defatulEvent();
        player.defatulEvent();
        video.dispatchEvent(new Event('error'));
        if (recoveries !== 1) throw new Error('Duplicate recovery listeners');
        player.detachMediaElement();
        video.dispatchEvent(new Event('error'));
        if (recoveries !== 1) throw new Error('Detached listener is still active');
        player.attachMediaElement(video);
        player.load();
        video.dispatchEvent(new Event('error'));
        if (recoveries !== 2) throw new Error('Recovery listener was not restored');
        player.unload();
        video.dispatchEvent(new Event('error'));
        if (recoveries !== 2) throw new Error('Stopped player tried to recover');
        delete video.error;
        player.destroy();
    });
});

test('cached events only reach new subscribers and queued callbacks stop on destroy', async ({lifecyclePage: page}) => {
    const result = await page.evaluate(async () => {
        makePlayer({deferLoadAfterSourceOpen: false});
        player.load();
        let oldCalls = 0, newCalls = 0, removedCalls = 0;
        player.on(mpegts.Events.MEDIA_INFO, () => oldCalls++);
        player._mediaInfo = {mimeType: 'video/mp4'};
        player.on(mpegts.Events.MEDIA_INFO, () => newCalls++);
        const removed = () => removedCalls++;
        player.on(mpegts.Events.MEDIA_INFO, removed);
        player.off(mpegts.Events.MEDIA_INFO, removed);
        await Promise.resolve();
        player.on(mpegts.Events.MEDIA_INFO, () => newCalls++);
        // Main-thread transmuxing also defers its events through microtasks.
        player._transmuxer._onMediaInfo({mimeType: 'video/mp4'});
        player._transmuxer._onAudioBuffer('audio', {data: new ArrayBuffer(2)});
        player.destroy();
        player.off(mpegts.Events.MEDIA_INFO, removed);
        await Promise.resolve();
        return {oldCalls, newCalls, removedCalls};
    });
    expect(result).toEqual({oldCalls: 0, newCalls: 1, removedCalls: 0});
});

test('stopping before SourceBuffer creation discards queued initialization and media', async ({lifecyclePage: page}) => {
    const result = await page.evaluate(() => {
        makePlayer();
        const controller = player._msectl;
        controller.appendInitSegment({type: 'video', container: 'video/mp4', data: new ArrayBuffer(0)});
        controller.appendMediaSegment({type: 'video', data: new ArrayBuffer(0)});
        player.unload();
        const result = {
            initializations: controller._pendingSourceBufferInit.length,
            segments: controller._pendingSegments.video.length
        };
        player.destroy();
        return result;
    });
    expect(result).toEqual({initializations: 0, segments: 0});
});

test('closed MediaSource removes SourceBuffer listeners and ignores queued callbacks', async ({lifecyclePage: page}) => {
    await page.evaluate(() => { makePlayer(); player.load(); player.play(); });
    await waitForPlayback(page);
    await page.evaluate(() => {
        window.controller = player._msectl;
        window.source = controller._mediaSource;
        window.removedBufferListeners = [];
        window.oldUpdateEnd = controller.e.onSourceBufferUpdateEnd;
        window.oldSourceOpen = controller.e.onSourceOpen;
        window.buffers = Object.values(controller._sourceBuffers).filter(Boolean);
        for (const buffer of buffers) {
            const remove = buffer.removeEventListener.bind(buffer);
            buffer.removeEventListener = (name, listener, options) => {
                removedBufferListeners.push(name);
                remove(name, listener, options);
            };
        }
        // Simulate a host application resetting the video src before destroying the player.
        const video = document.querySelector('#video');
        video.removeAttribute('src');
        video.load();
    });
    await page.waitForFunction(() => source.readyState === 'closed');
    const result = await page.evaluate(() => {
        player.destroy();
        oldUpdateEnd();
        oldSourceOpen();
        return {count: buffers.length, errors: removedBufferListeners.filter(name => name === 'error').length,
            updates: removedBufferListeners.filter(name => name === 'updateend').length};
    });
    expect(result.count).toBeGreaterThan(0);
    expect(result.errors).toBe(result.count);
    expect(result.updates).toBe(result.count);
});

test('pending dual-MSE play requests can be paused and detached without unhandled AbortError', async ({lifecyclePage: page}) => {
    await page.evaluate(() => {
        makePlayer({splitAVBuffers: true});
        // No media data: both native play promises remain pending until pause/detach.
        player.play();
        player.pause();
        player.detachMediaElement();
    });
    await page.waitForTimeout(100);
    await page.evaluate(() => player.destroy());
});

test('play still returns the native rejection to callers while owning auxiliary audio rejection', async ({lifecyclePage: page}) => {
    const message = await page.evaluate(async () => {
        makePlayer({splitAVBuffers: true});
        const video = document.querySelector('#video'), audio = document.querySelector('#audio');
        video.play = () => Promise.reject(new DOMException('Video denied', 'NotAllowedError'));
        audio.play = () => Promise.reject(new DOMException('Audio denied', 'NotAllowedError'));
        try { await player.play(); return 'unexpected success'; }
        catch (error) { return error.message; }
        finally { player.destroy(); }
    });
    expect(message).toBe('Video denied');
});

test('live latency chasing stays inside a short late GOP instead of clearing MSE with an unbuffered seek', async ({lifecyclePage: page}) => {
    const result = await page.evaluate(() => {
        const results = [];
        for (const ranges of [[[6, 6.2]], [[0, 0.8], [6, 6.2]]]) {
            makePlayer({isLive: true, liveBufferLatencyChasing: true, liveBufferLatencyMinRemain: 0.5});
            const realMedia = player._mediaElement;
            const calls = [];
            const media = {paused: false, currentTime: 0, buffered: {
                length: ranges.length, start: i => ranges[i][0], end: i => ranges[i][1]
            }};
            player._mediaElement = media;
            player._transmuxer = {seek: time => calls.push(['network', time])};
            const seek = player._msectl.seek;
            player._msectl.seek = time => calls.push(['clear', time]);
            player._onmseUpdateEnd();
            results.push({time: media.currentTime, calls});
            player._mediaElement = realMedia; player._transmuxer = null; player._msectl.seek = seek;
            player.destroy();
        }
        return results;
    });
    expect(result).toEqual([{time: 6, calls: []}, {time: 6, calls: []}]);
});
