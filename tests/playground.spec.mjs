import {test, expect} from '@playwright/test';

test('playground Worker video preview renders while MSE remains unused', async ({page}) => {
    await page.locator('#sample-stream').selectOption('av');
    await page.locator('#webcodec').check();
    await expect(page.locator('#decode-video')).toBeChecked();
    await expect(page.locator('#render-backend')).toHaveValue('webgl');
    await page.locator('#create-player').click();
    await expect(page.locator('#status')).toContainText('视频解码完成');
    await expect(page.locator('#sample-counts')).toContainText(/渲染帧：[1-9]/);
    await expect(page.locator('#render-status')).toContainText('实际渲染：WebGL');
    const pixel = await page.evaluate(() => playgroundPixel);
    expect(pixel[2]).toBeGreaterThan(200);
    expect(await page.evaluate(() => playgroundMediaSources.length)).toBe(0);
    expect(await page.evaluate(() => playgroundErrors)).toEqual([]);
    await page.locator('#destroy-player').click();
    await expect(page.locator('#player-root canvas')).toHaveCount(0);
});

test.beforeEach(async ({page}, testInfo) => {
    await page.addInitScript(() => {
        window.playgroundMediaSources = [];
        const OriginalMediaSource = window.MediaSource;
        window.MediaSource = class extends OriginalMediaSource {
            constructor(...args) {
                super(...args);
                window.playgroundMediaSources.push(this);
            }
        };
        window.playgroundPixel = [];
        const draw = WebGLRenderingContext.prototype.drawArrays;
        WebGLRenderingContext.prototype.drawArrays = function(...args) {
            draw.apply(this, args);
            const pixel = new Uint8Array(4);
            this.readPixels(20, 20, 1, 1, this.RGBA, this.UNSIGNED_BYTE, pixel);
            window.playgroundPixel = Array.from(pixel);
        };
        window.playgroundErrors = [];
        window.addEventListener('error', event => playgroundErrors.push(event.message));
        window.addEventListener('unhandledrejection', event => playgroundErrors.push(String(event.reason)));
    });
    await page.goto(testInfo.project.name === 'bundle' ? '/dist/playground/index.html' : '/');
});

for (const {sample, expected, absent} of [
    {sample: 'av', expected: ['config', 'video', 'audio'], absent: ['pcm']},
    {sample: 'hevc', expected: ['config', 'video'], absent: ['audio', 'pcm']},
    {sample: 'pcm', expected: ['config', 'video', 'pcm'], absent: ['audio']}
]) {
    test(`playground ${sample} logs separate sample types without creating MSE`, async ({page}) => {
        const messages = [];
        page.on('console', message => messages.push(message.text()));
        await page.locator('#sample-stream').selectOption(sample);
        await page.locator('#webcodec').check();
        await page.locator('#decode-video').uncheck();
        await page.locator('#create-player').click();
        await expect(page.locator('#status')).toContainText('编码流读取完成');
        for (const type of expected) {
            expect(messages.some(message => message.startsWith(`[DecodeStream][${type}]`))).toBe(true);
        }
        for (const type of absent) {
            expect(messages.some(message => message.startsWith(`[DecodeStream][${type}]`))).toBe(false);
        }
        expect(messages.some(message => message.startsWith('[DecodeStream][error]'))).toBe(false);
        await expect(page.locator('#sample-counts')).toContainText(/视频编码帧数：[1-9]/);
        expect(await page.evaluate(() => playgroundMediaSources.length)).toBe(0);
        expect(await page.evaluate(() => playgroundErrors)).toEqual([]);
        await page.locator('#destroy-player').click();
        await expect(page.locator('#status')).toContainText('已销毁');
    });
}

test('playground defaults to dual MSE and switches to sample debug on explicit request', async ({page}) => {
    await expect(page.locator('#webcodec')).not.toBeChecked();
    expect(await page.evaluate(() => playgroundMediaSources.length)).toBe(0);
    await page.locator('#sample-stream').selectOption('av');
    await page.locator('#create-player').click();
    await page.waitForFunction(() => playgroundMediaSources.length === 2 &&
        playgroundMediaSources.every(mse => mse.sourceBuffers.length > 0 && mse.sourceBuffers[0].buffered.length > 0));
    await expect(page.locator('#sample-counts')).toBeHidden();
    await page.locator('#webcodec').check();
    await page.locator('#decode-video').uncheck();
    await page.locator('#create-player').click();
    await expect(page.locator('#status')).toContainText('编码流读取完成');
    await page.waitForFunction(() => playgroundMediaSources.every(mse => mse.readyState === 'closed'));
    expect(await page.evaluate(() => playgroundMediaSources.length)).toBe(2);
    expect(await page.evaluate(() => playgroundErrors)).toEqual([]);
    await page.locator('#destroy-player').click();
});

test('playground destroys an in-flight debug stream and ignores late responses', async ({page}) => {
    let received;
    const pending = new Promise(resolve => { received = resolve; });
    await page.route('**/delayed-debug.flv', route => { received(route); });
    const messages = [];
    page.on('console', message => messages.push(message.text()));
    await page.locator('#stream-url').fill('/delayed-debug.flv');
    await page.locator('#webcodec').check();
    await page.locator('#decode-video').uncheck();
    await page.locator('#create-player').click();
    const delayed = await pending;
    await page.locator('#destroy-player').click();
    await expect(page.locator('#status')).toContainText('已销毁');
    await delayed.fulfill({body: 'late invalid FLV response'});
    await page.locator('#sample-stream').selectOption('av');
    await page.locator('#create-player').click();
    await expect(page.locator('#status')).toContainText('编码流读取完成');
    expect(messages.filter(message => message.startsWith('[DecodeStream][complete]'))).toHaveLength(1);
    expect(messages.some(message => message.startsWith('[DecodeStream][error]'))).toBe(false);
    expect(await page.evaluate(() => playgroundErrors)).toEqual([]);
    await page.locator('#destroy-player').click();
});

test('playground reports missing URL and network failures', async ({page}) => {
    await page.locator('#create-player').click();
    await expect(page.locator('#status')).toContainText('请先输入');
    await page.route('**/debug-missing.flv', route => route.fulfill({status: 404, body: 'Not found'}));
    await page.locator('#stream-url').fill('/debug-missing.flv');
    await page.locator('#webcodec').check();
    await page.locator('#decode-video').uncheck();
    await page.locator('#create-player').click();
    await expect(page.locator('#status')).toContainText('编码流调试失败');
    expect(await page.evaluate(() => playgroundErrors)).toEqual([]);
    await page.locator('#destroy-player').click();
});

test('playground compares MSE and WebCodecs together and cleans up both when switching', async ({page}) => {
    await page.locator('#sample-stream').selectOption('av');
    await page.locator('#mse-max-latency').fill('0.9');
    await page.locator('#compare-players').click();
    await expect(page.locator('#comparison-panel')).toBeVisible();
    await expect(page.locator('#sample-counts')).toContainText(/渲染帧：[1-9]/);
    await expect(page.locator('#mse-counts')).toContainText(/首帧等待：\d+ ms/);
    await page.waitForFunction(() => playgroundMediaSources.length === 2 &&
        playgroundMediaSources.every(mse => mse.sourceBuffers.length > 0 && mse.sourceBuffers[0].buffered.length > 0));
    await expect(page.locator('#player-root canvas')).toHaveCount(1);
    // Switch to the existing single-path debug mode; neither old MSE remains open.
    await page.locator('#webcodec').check();
    await page.locator('#decode-video').uncheck();
    await page.locator('#create-player').click();
    await expect(page.locator('#status')).toContainText('编码流读取完成');
    await expect(page.locator('#comparison-panel')).toBeHidden();
    await page.waitForFunction(() => playgroundMediaSources.every(mse => mse.readyState === 'closed'));
    await expect(page.locator('#comparison-root')).toBeEmpty();
    await page.locator('#destroy-player').click();
    expect(await page.evaluate(() => playgroundErrors)).toEqual([]);
});

test('optional live comparison renders both modes and releases them on destroy', async ({page}) => {
    test.skip(!process.env.STREAMCANVASX_LIVE_URL, 'Requires a live stream');
    await page.locator('#stream-url').fill(process.env.STREAMCANVASX_LIVE_URL);
    await page.locator('#compare-players').click();
    await expect(page.locator('#sample-counts')).toContainText(/渲染帧：[1-9]/, {timeout: 15000});
    await expect(page.locator('#mse-counts')).toContainText(/首帧等待：\d+ ms/, {timeout: 15000});
    await expect(page.locator('#mse-counts')).toContainText(/视频呈现 FPS：[1-9]/);
    await expect(page.locator('#sample-counts')).toContainText(/显示 FPS：[1-9]/);
    await page.locator('#destroy-player').click();
    await page.waitForFunction(() => playgroundMediaSources.length === 2 &&
        playgroundMediaSources.every(mse => mse.readyState === 'closed'));
    await expect(page.locator('#comparison-root')).toBeEmpty();
    await expect(page.locator('#player-root')).toBeEmpty();
    expect(await page.evaluate(() => playgroundErrors)).toEqual([]);
});


test('playground rejects inconsistent latency settings before starting either player', async ({page}) => {
    await page.locator('#sample-stream').selectOption('av');
    for (const [id, invalid, restore, message] of [
        ['mse-max-latency', '0.5', '1.5', '必须大于保留缓冲'],
        ['mse-max-latency', '0.4', '1.5', '必须大于保留缓冲'],
    ]) {
        await page.locator(`#${id}`).fill(invalid);
        await page.locator('#compare-players').click();
        await expect(page.locator('#status')).toContainText(message);
        expect(await page.evaluate(() => playgroundMediaSources.length)).toBe(0);
        await expect(page.locator('#player-root canvas')).toHaveCount(0);
        await page.locator(`#${id}`).fill(restore);
    }
    await page.locator('#create-player').click();
    await page.waitForFunction(() => playgroundMediaSources.length === 2 &&
        playgroundMediaSources.every(mse => mse.sourceBuffers.length > 0 && mse.sourceBuffers[0].buffered.length > 0));
    await page.locator('#destroy-player').click();
    expect(await page.evaluate(() => playgroundErrors)).toEqual([]);
});
