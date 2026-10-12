import {test, expect} from '@playwright/test';

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
        await page.locator('#create-player').click();
        await expect(page.locator('#status')).toContainText('编码流读取完成');
        for (const type of expected) {
            expect(messages.some(message => message.startsWith(`[DecodeStream][${type}]`))).toBe(true);
        }
        for (const type of absent) {
            expect(messages.some(message => message.startsWith(`[DecodeStream][${type}]`))).toBe(false);
        }
        expect(messages.some(message => message.startsWith('[DecodeStream][error]'))).toBe(false);
        await expect(page.locator('#sample-counts')).toContainText(/视频样本：[1-9]/);
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
    await page.locator('#create-player').click();
    await expect(page.locator('#status')).toContainText('编码流调试失败');
    expect(await page.evaluate(() => playgroundErrors)).toEqual([]);
    await page.locator('#destroy-player').click();
});
