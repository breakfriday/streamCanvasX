/// <reference types="@webgpu/types" />
import type {VideoFrameRenderer} from './webcodecs-renderer-types';

const shader = `
struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
};
@vertex fn vs(@builtin(vertex_index) index: u32) -> VertexOutput {
    let positions = array<vec2f, 6>(
        vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1),
        vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1)
    );
    var result: VertexOutput;
    result.position = vec4f(positions[index], 0, 1);
    result.uv = positions[index] * vec2f(0.5, -0.5) + 0.5;
    return result;
}
@group(0) @binding(0) var videoSampler: sampler;
@group(0) @binding(1) var video: texture_external;
@fragment fn fs(input: VertexOutput) -> @location(0) vec4f {
    return textureSampleBaseClampToEdge(video, videoSampler, input.uv);
}`;

/** Dedicated device/context. A failed GPU backend never locks the fallback canvas. */
export default class WebCodecsWebGPURenderer implements VideoFrameRenderer {
    readonly kind = 'webgpu' as const;
    private destroyed = false;
    private onUncaptured = (event: GPUUncapturedErrorEvent): void => {
        event.preventDefault();
        if (!this.destroyed) this.onError(new Error(event.error.message));
    };

    private constructor(
        readonly canvas: HTMLCanvasElement,
        private device: GPUDevice,
        private context: GPUCanvasContext,
        private pipeline: GPURenderPipeline,
        private sampler: GPUSampler,
        private onError: (error: Error) => void,
    ) {
        device.addEventListener('uncapturederror', this.onUncaptured);
        void device.lost.then(info => {
            if (!this.destroyed) this.onError(new Error(`WebGPU device lost: ${info.message}`));
        });
    }

    static async create(onError: (error: Error) => void, signal: AbortSignal): Promise<WebCodecsWebGPURenderer> {
        let device: GPUDevice | undefined;
        let context: GPUCanvasContext | null = null;
        const canvas = document.createElement('canvas');
        const release = (): void => {
            context?.unconfigure();
            device?.destroy();
            context = null;
            device = undefined;
        };
        signal.addEventListener('abort', release, {once: true});
        const check = (): void => {
            if (signal.aborted) throw new Error('WebGPU initialization cancelled or timed out');
        };
        try {
            check();
            if (!navigator.gpu) throw new Error('WebGPU is unavailable');
            const adapter = await navigator.gpu.requestAdapter();
            check();
            if (!adapter) throw new Error('No WebGPU adapter is available');
            device = await adapter.requestDevice();
            check();
            context = canvas.getContext('webgpu');
            if (!context) throw new Error('WebGPU canvas context is unavailable');
            const format = navigator.gpu.getPreferredCanvasFormat();
            const module = device.createShaderModule({code: shader});
            const pipeline = await device.createRenderPipelineAsync({
                layout: 'auto',
                vertex: {module, entryPoint: 'vs'},
                fragment: {module, entryPoint: 'fs', targets: [{format}]},
                primitive: {topology: 'triangle-list'}
            });
            check();
            context.configure({device, format, alphaMode: 'opaque'});
            return new WebCodecsWebGPURenderer(canvas, device, context, pipeline,
                device.createSampler({magFilter: 'linear', minFilter: 'linear'}), onError);
        } catch (error) {
            release();
            throw error;
        } finally {
            signal.removeEventListener('abort', release);
        }
    }

    draw(frame: VideoFrame): void {
        if (this.destroyed) throw new Error('WebGPU renderer is destroyed');
        if (this.canvas.width !== frame.displayWidth) this.canvas.width = frame.displayWidth;
        if (this.canvas.height !== frame.displayHeight) this.canvas.height = frame.displayHeight;
        const external = this.device.importExternalTexture({source: frame});
        const bindings = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [{binding: 0, resource: this.sampler}, {binding: 1, resource: external}]
        });
        const encoder = this.device.createCommandEncoder();
        const pass = encoder.beginRenderPass({colorAttachments: [{
            view: this.context.getCurrentTexture().createView(),
            clearValue: {r: 0, g: 0, b: 0, a: 1}, loadOp: 'clear', storeOp: 'store'
        }]});
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, bindings);
        pass.draw(6);
        pass.end();
        this.device.queue.submit([encoder.finish()]);
    }

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.device.removeEventListener('uncapturederror', this.onUncaptured);
        this.context.unconfigure();
        this.device.destroy();
        this.canvas.remove();
    }
}
