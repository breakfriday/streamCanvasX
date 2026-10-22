import {test, expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';

test.beforeEach(async ({page}, testInfo) => {
    await page.goto(testInfo.project.name === 'bundle' ? '/dist/playground/index.html' : '/');
});

for (const backend of ['webgl', 'webgpu']) {
    test(`optional live ${backend} preview sustains source frame cadence`, async ({page}, testInfo) => {
        test.skip(!process.env.STREAMCANVASX_LIVE_URL, 'Requires the supplied live stream');
        await page.evaluate(() => {
            window.liveTiming = {raf: [], arrivals: []};
            const raf = window.requestAnimationFrame;
            window.requestAnimationFrame = callback => raf(time => {
                liveTiming.raf.push(time);
                if (liveTiming.raf.length > 600) liveTiming.raf.shift();
                callback(time);
            });
            const clone = VideoFrame.prototype.clone;
            VideoFrame.prototype.clone = function() {
                liveTiming.arrivals.push({pts: this.timestamp, now: performance.now()});
                if (liveTiming.arrivals.length > 600) liveTiming.arrivals.shift();
                return clone.call(this);
            };
        });
        await page.locator('#stream-url').fill(process.env.STREAMCANVASX_LIVE_URL);
        await page.locator('#webcodec').check();
        await page.locator('#render-backend').selectOption(backend);
        await page.locator('#create-player').click();
        await expect(page.locator('#sample-counts')).toContainText(/渲染帧：[1-9]/, {timeout: 10000});
        const read = () => page.locator('#sample-counts').innerText();
        const before = Number((await read()).match(/渲染帧：(\d+)/)[1]);
        await page.waitForTimeout(4000);
        const text = await read();
        const timing = await page.evaluate(() => ({...liveTiming,
            backend: document.querySelector('#render-status')?.textContent}));
        await testInfo.attach('live-timing', {body: JSON.stringify(timing), contentType: 'application/json'});
        await writeFile(`/tmp/streamcanvasx-buffer-timing-${testInfo.project.name}-${backend}.json`, JSON.stringify(timing));
        const after = Number(text.match(/渲染帧：(\d+)/)[1]);
        await testInfo.attach('render-statistics', {body: text, contentType: 'text/plain'});
        console.log(`[live ${testInfo.project.name}/${backend}] ${text}; measured fps=${(after - before) / 4}`);
        await page.screenshot({path: `/tmp/streamcanvasx-live-${testInfo.project.name}-${backend}.png`});
        expect(after - before).toBeGreaterThan(80);
        const receiveLag = Number(text.match(/接收边缘落后：(\d+)/)?.[1]);
        expect(receiveLag).toBeLessThan(800);
        // Force main-thread starvation while the Worker continues to receive live data.
        // Recovery must approach the receive edge, not replay the accumulated history.
        await page.evaluate(() => {
            const until = performance.now() + 1200;
            while (performance.now() < until) { /* simulate an expensive main-thread task */ }
        });
        await expect.poll(async () => Number((await read()).match(/渲染帧：(\d+)/)?.[1]),
            {timeout: 4000}).toBeGreaterThan(after + 5);
        await expect.poll(async () => {
            const current = await read();
            return Number(current.match(/接收边缘落后：(\d+)/)?.[1]);
        }, {timeout: 4000}).toBeLessThan(700);
        await testInfo.attach('post-stall-statistics', {body: await read(), contentType: 'text/plain'});
        console.log(`[post-stall ${testInfo.project.name}/${backend}] ${await read()}`);
        await expect(page.locator('#status')).not.toContainText('失败');
        await page.locator('#destroy-player').click();
        await expect(page.locator('#player-root canvas')).toHaveCount(0);
    });
}

test('WebGL draws asymmetric frames upright, resizes and releases the context', async ({page}) => {
    const result = await page.evaluate(async () => {
        const {default: Renderer} = await import('/packages/player/src/services/renderingEngines/webcodecs-webgl-renderer.ts');
        const errors = [];
        const renderer = new Renderer(error => errors.push(error.message));
        const source = document.createElement('canvas');
        source.width = 16; source.height = 8;
        const ctx = source.getContext('2d');
        for (const [color, x, y] of [['red', 0, 0], ['lime', 8, 0], ['blue', 0, 4], ['yellow', 8, 4]]) {
            ctx.fillStyle = color; ctx.fillRect(x, y, 8, 4);
        }
        const first = new VideoFrame(source, {timestamp: 0});
        renderer.draw(first);
        first.close();
        const gl = renderer.canvas.getContext('webgl');
        const pixels = [[2, 6], [10, 6], [2, 2], [10, 2]].map(([x, y]) => {
            const pixel = new Uint8Array(4);
            gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            return Array.from(pixel);
        });
        source.width = 32; source.height = 16;
        const next = new VideoFrame(source, {timestamp: 1});
        renderer.draw(next); next.close();
        const size = [renderer.canvas.width, renderer.canvas.height];
        const glError = gl.getError();
        renderer.destroy(); renderer.destroy();
        return {pixels, size, glError, errors, lost: gl.isContextLost()};
    });
    expect(result.pixels).toEqual([[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255], [255, 255, 0, 255]]);
    expect(result.size).toEqual([32, 16]);
    expect(result.glError).toBe(0);
    expect(result.errors).toEqual([]);
    expect(result.lost).toBe(true);
});

for (const failure of ['missing-api', 'no-adapter', 'device-rejected']) {
    test(`WebGPU ${failure} falls back to WebGL and still draws real decoded video`, async ({page}) => {
        await page.evaluate(failure => {
            const gpu = failure === 'missing-api' ? undefined : {
                requestAdapter: async () => failure === 'no-adapter' ? null : {
                    requestDevice: async () => { throw Error('device denied'); }
                }
            };
            Object.defineProperty(navigator, 'gpu', {value: gpu, configurable: true});
        }, failure);
        await page.locator('#stream-url').fill('/packages/playercore/tests/fixtures/av.flv');
        await page.locator('#webcodec').check();
        await page.locator('#render-backend').selectOption('webgpu');
        await page.locator('#create-player').click();
        await expect(page.locator('#status')).toContainText('视频解码完成');
        await expect(page.locator('#sample-counts')).toContainText(/渲染帧：[1-9]/);
        await expect(page.locator('#render-status')).toContainText('已回退 WebGL');
        await expect(page.locator('#player-root canvas')).toHaveAttribute('data-render-backend', 'webgl');
        await page.locator('#destroy-player').click();
        await expect(page.locator('#player-root canvas')).toHaveCount(0);
    });
}

test('destroy during WebGPU device initialization releases late resources without attaching a canvas', async ({page}) => {
    const result = await page.evaluate(async () => {
        const {default: Renderer} = await import('/packages/player/src/services/renderingEngines/webcodecs-video-renderer.ts');
        let resolveDevice;
        let destroyed = 0;
        Object.defineProperty(navigator, 'gpu', {configurable: true, value: {
            requestAdapter: async () => ({requestDevice: () => new Promise(resolve => { resolveDevice = resolve; })})
        }});
        const container = document.createElement('div');
        const changes = [], errors = [];
        const renderer = new Renderer(container, {backend: 'webgpu',
            onBackendChanged: backend => changes.push(backend), onError: error => errors.push(error.message)});
        await new Promise(resolve => setTimeout(resolve));
        renderer.destroy();
        await renderer.ready;
        resolveDevice({destroy: () => destroyed++});
        await new Promise(resolve => setTimeout(resolve));
        return {destroyed, changes, errors, canvases: container.children.length};
    });
    expect(result).toEqual({destroyed: 1, changes: [], errors: [], canvases: 0});
});

test('WebGPU timeout falls back and releases a device that arrives late', async ({page}) => {
    await page.clock.install();
    await page.evaluate(async () => {
        const {default: Renderer} = await import('/packages/player/src/services/renderingEngines/webcodecs-video-renderer.ts');
        window.deviceDestroyed = 0;
        Object.defineProperty(navigator, 'gpu', {configurable: true, value: {
            requestAdapter: async () => ({requestDevice: () => new Promise(resolve => { window.deliverDevice = resolve; })})
        }});
        window.renderContainer = document.createElement('div');
        window.testRenderer = new Renderer(renderContainer, {backend: 'webgpu'});
    });
    await expect.poll(() => page.evaluate(() => typeof deliverDevice)).toBe('function');
    await page.clock.fastForward(5100);
    const result = await page.evaluate(async () => {
        await testRenderer.ready;
        const backend = testRenderer.canvas.dataset.renderBackend;
        deliverDevice({destroy: () => deviceDestroyed++});
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
        testRenderer.destroy();
        return {backend, destroyed: deviceDestroyed, canvases: renderContainer.children.length};
    });
    expect(result).toEqual({backend: 'webgl', destroyed: 1, canvases: 0});
});

test('frame scheduler buffers frames and closes clones on late presentation/destroy', async ({page}) => {
    const result = await page.evaluate(async () => {
        const {default: Renderer} = await import('/packages/player/src/services/renderingEngines/webcodecs-video-renderer.ts');
        const renderer = new Renderer(document.createElement('div'));
        await renderer.ready;
        const source = document.createElement('canvas');
        const frames = [], clones = [];
        const clone = VideoFrame.prototype.clone;
        VideoFrame.prototype.clone = function() { const result = clone.call(this); clones.push(result); return result; };
        try {
            for (let i = 0; i < 3; i++) {
                const frame = new VideoFrame(source, {timestamp: i});
                frames.push(frame); renderer.render(frame); frame.close();
            }
            const buffered = clones.every(frame => frame.codedWidth > 0);
            await new Promise(resolve => setTimeout(resolve, 180));
            const drawnClosed = clones.every(frame => frame.codedWidth === 0);
            const frame = new VideoFrame(source, {timestamp: 3});
            renderer.render(frame); frame.close();
            renderer.destroy();
            return {buffered, drawnClosed, destroyedClosed: clones.every(frame => frame.codedWidth === 0)};
        } finally { VideoFrame.prototype.clone = clone; renderer.destroy(); }
    });
    expect(result).toEqual({buffered: true, drawnClosed: true, destroyedClosed: true});
});

test('WebGL context loss is reported instead of leaving a silently frozen canvas', async ({page}) => {
    const result = await page.evaluate(async () => {
        const {default: Renderer} = await import('/packages/player/src/services/renderingEngines/webcodecs-video-renderer.ts');
        const errors = [];
        let resolveError;
        const error = new Promise(resolve => { resolveError = resolve; });
        const renderer = new Renderer(document.createElement('div'), {onError: failure => {
            errors.push(failure.message); resolveError();
        }});
        await renderer.ready;
        renderer.canvas.getContext('webgl').getExtension('WEBGL_lose_context').loseContext();
        await error;
        renderer.destroy();
        return errors;
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('context lost');
});

test('real WebGPU renders correct pixels and recovers to WebGL on device loss', async ({page}) => {
    test.skip(!process.env.STREAMCANVASX_TEST_WEBGPU, 'Enable with a WebGPU-capable browser to test the actual GPU pipeline');
    const result = await page.evaluate(async () => {
        const {default: GPU} = await import('/packages/player/src/services/renderingEngines/webcodecs-webgpu-renderer.ts');
        const {default: Renderer} = await import('/packages/player/src/services/renderingEngines/webcodecs-video-renderer.ts');
        const original = GPUAdapter.prototype.requestDevice;
        const configure = GPUCanvasContext.prototype.configure;
        GPUCanvasContext.prototype.configure = function(config) {
            configure.call(this, {...config, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC});
        };
        let device;
        GPUAdapter.prototype.requestDevice = async function(...args) { return device = await original.apply(this, args); };
        const errors = [], changes = [];
        const backend = await GPU.create(error => errors.push(error.message), new AbortController().signal);
        let renderer;
        let frame;
        try {
            const source = document.createElement('canvas'); source.width = 16; source.height = 8;
            const ctx = source.getContext('2d');
            for (const [color, x, y] of [['red', 0, 0], ['lime', 8, 0], ['blue', 0, 4], ['yellow', 8, 4]]) {
                ctx.fillStyle = color; ctx.fillRect(x, y, 8, 4);
            }
            frame = new VideoFrame(source, {timestamp: 0});
            backend.draw(frame);
            const buffer = device.createBuffer({size: 256 * 8, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ});
            const encoder = device.createCommandEncoder();
            encoder.copyTextureToBuffer({texture: backend.canvas.getContext('webgpu').getCurrentTexture()},
                {buffer, bytesPerRow: 256}, {width: 16, height: 8});
            device.queue.submit([encoder.finish()]);
            await buffer.mapAsync(GPUMapMode.READ);
            const bytes = new Uint8Array(buffer.getMappedRange());
            const bgra = navigator.gpu.getPreferredCanvasFormat() === 'bgra8unorm';
            const pixels = [[2, 2], [10, 2], [2, 6], [10, 6]].map(([x, y]) => {
                const offset = y * 256 + x * 4;
                const rgba = Array.from(bytes.slice(offset, offset + 4));
                return bgra ? [rgba[2], rgba[1], rgba[0], rgba[3]] : rgba;
            });
            buffer.unmap(); buffer.destroy(); backend.destroy();
            renderer = new Renderer(document.createElement('div'), {backend: 'webgpu',
                onError: error => errors.push(error.message), onBackendChanged: value => changes.push(value)});
            await renderer.ready;
            device.destroy();
            await device.lost;
            await new Promise(resolve => setTimeout(resolve));
            return {errors, changes, pixels};
        } finally {
            frame?.close(); backend.destroy(); renderer?.destroy();
            GPUAdapter.prototype.requestDevice = original; GPUCanvasContext.prototype.configure = configure;
        }
    });
    expect(result.errors, JSON.stringify(result)).toEqual([]);
    expect(result.changes).toEqual(['webgpu', 'webgl']);
    expect(result.pixels).toEqual([[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255], [255, 255, 0, 255]]);
});
