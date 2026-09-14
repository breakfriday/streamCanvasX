import vertexWGSL from './vertex.wgsl?raw';
import fragmentWGSL from './fragment.wgsl?raw';

interface YUVFrame {
    yData: Uint8Array;
    uData: Uint8Array;
    vData: Uint8Array;
    width: number;
    height: number;
    yDataSize?: number;
    uDataSize?: number;
    vDataSize?: number;
    actualRowWidth?: number;
    validWidth?: number;

  }
class YuvWebGpuEngine {
    private device: GPUDevice;
    private context: GPUCanvasContext;
    private gpuContext: GPUCanvasContext;
    private pipeline: GPURenderPipeline;
    private yTexture: GPUTexture;
    private uTexture: GPUTexture;
    private vTexture: GPUTexture;
    private textureView: GPUTextureView;
    bindGroup: GPUBindGroup
    GpuContext: GPUCanvasContext;
    canvas_el: OffscreenCanvas;
    vertexBuffer: GPUBuffer

    constructor(canvas: HTMLCanvasElement) {

    }

    init() {
        this.initGpu();
        this.createVertexBuffer();
        this.createPipeline();
    }

    private createVertexBuffer() {
        const vertexData = new Float32Array([
            -1.0, -1.0,
             1.0, -1.0,
            -1.0, 1.0,
            -1.0, 1.0,
             1.0, -1.0,
             1.0, 1.0,
        ]);

        this.vertexBuffer = this.device.createBuffer({
            size: vertexData.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });

        this.device.queue.writeBuffer(this.vertexBuffer, 0, vertexData);
    }


    private createPipeline() {
        const vertexShaderModule = this.device.createShaderModule({
            code: vertexWGSL,
        });
        const fragmentShaderModuele= this.device.createShaderModule({
            code: fragmentWGSL,
        });

        // 创建绑定组布局,定义了在着色器中使用的资源类型和绑定点（如采样器和纹理）
        const bindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
                { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
                { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
                { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
                { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
            ],
        });

        // 创建管道布局，传入绑定组布局
        const pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [bindGroupLayout],
        });

        let pipeline = this.device.createRenderPipeline({
            layout: pipelineLayout, // 指定管线布局
            vertex: {
                module: vertexShaderModule,
                entryPoint: 'vertex_main',
                buffers: [{
                    arrayStride: 2 * 4, // x,y 每个顶点两个 32 位浮点数，每个浮点数占 4 个字节
                    attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
                }]
            },
            fragment: {
                module: fragmentShaderModuele,
                entryPoint: 'fragment_main',
                targets: [{ format: 'bgra8unorm' }],
            },

        });

        this.pipeline=pipeline;
    }

    async initGpu() {
        if (!navigator.gpu) {
            console.error('WebGPU is not supported on this browser.');
            return;
        }

        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
          throw Error("Couldn't request WebGPU adapter.");
        }
        this.device = await adapter.requestDevice();

        this.gpuContext = this.canvas_el.getContext('webgpu');
    }

    private createTexture(data: Uint8Array, width: number, height: number): GPUTexture {
        const texture = this.device.createTexture({
            size: [width, height, 1],
            format: 'r8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });

        this.device.queue.writeTexture(
            { texture: texture },
            data,
            { bytesPerRow: width },
            [width, height, 1]
        );

        return texture;
    }


createTextures(frame: YUVFrame) {
    // 创建 Y、U、V 分量的纹理
    this.yTexture = this.createTexture(frame.yData, frame.width, frame.height);
    this.uTexture = this.createTexture(frame.uData, frame.width / 2, frame.height / 2);
    this.vTexture = this.createTexture(frame.vData, frame.width / 2, frame.height / 2);

    // 获取管道的绑定组布局
    const bindGroupLayout = this.pipeline.getBindGroupLayout(0);


    // 创建绑定组：从管道中获取绑定组布局，使用它来创建绑定组，并将实际的资源（纹理和采样器）绑定到绑定点上。
        this.bindGroup = this.device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
                { binding: 0, resource: this.device.createSampler() },// 绑定点 0, 1, 2: 分别是三个采样器（sampler），用于从纹理中采样数据。
                { binding: 1, resource: this.device.createSampler() },
                { binding: 2, resource: this.device.createSampler() },
                { binding: 3, resource: this.yTexture.createView() },// 绑定点 3: 绑定到 Y 纹理的视图。
                { binding: 4, resource: this.uTexture.createView() },// 绑定点 4: 绑定到 u 纹理的视图。
                { binding: 5, resource: this.vTexture.createView() },// 绑定点 4: 绑定到 v 纹理的视图。
            ],
        });
    }
    updateTextures(frame: YUVFrame) {
        this.device.queue.writeTexture(
            { texture: this.yTexture }, // 目标纹理
            frame.yData,// 數據
            { bytesPerRow: frame.width },// 数据布局，包含填充字节  ,這個比webgl 方便多了
            [frame.width, frame.height, 1] // 目标尺寸，使用实际视频帧的分辨率
        );

        this.device.queue.writeTexture(
            { texture: this.uTexture },
            frame.uData,
            { bytesPerRow: frame.width / 2 },
            [frame.width / 2, frame.height / 2, 1]
        );

        this.device.queue.writeTexture(
            { texture: this.vTexture },
            frame.vData,
            { bytesPerRow: frame.width / 2 },
            [frame.width / 2, frame.height / 2, 1]
        );
    }

    render() {
        // 创建命令编码器
    const commandEncoder = this.device.createCommandEncoder();

    // 获取当前帧的纹理视图
    const textureView = this.context.getCurrentTexture().createView();


    const renderPassDescriptor: GPURenderPassDescriptor = {
        colorAttachments: [
            {
                view: textureView, // 渲染目标视图
                loadOp: 'clear', // 清除操作
                clearValue: { r: 0, g: 0, b: 0, a: 1 }, // 清除颜色
                storeOp: 'store', // 存储操作
            },
        ],
      };

      // 开始记录渲染通道命令
    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);

    // 设置渲染管道
    passEncoder.setPipeline(this.pipeline);

    // 设置绑定组，包含纹理和采样器
    passEncoder.setBindGroup(0, this.bindGroup);

    passEncoder.setVertexBuffer(0,this.vertexBuffer);

     // 结束渲染通道命令记录
    passEncoder.end();

    const commandBuffer = commandEncoder.finish();

      // 提交命令队列
    this.device.queue.submit([commandBuffer]);
 }
}

export default YuvWebGpuEngine;
