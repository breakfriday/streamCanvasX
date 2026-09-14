import { Device, ShaderModule, Pipeline, Texture } from 'redgpu';

class YUVRenderer {
  private device: Device;
  private pipeline: Pipeline;
  private yTexture: Texture;
  private uTexture: Texture;
  private vTexture: Texture;
  private vertexBuffer: GPUBuffer;
  private indexBuffer: GPUBuffer;

  constructor(canvas: HTMLCanvasElement) {
    this.device = new Device(canvas);
    this.initPipeline();
    this.createTextures();
    this.createBuffers();
  }

  private async initPipeline() {
    const vertexShaderCode = `
      @stage(vertex)
      fn main(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4<f32> {
        var pos = array<vec2<f32>, 4>(
          vec2<f32>(-1.0, -1.0),
          vec2<f32>( 1.0, -1.0),
          vec2<f32>(-1.0,  1.0),
          vec2<f32>( 1.0,  1.0)
        );
        var uv = array<vec2<f32>, 4>(
          vec2<f32>(0.0, 0.0),
          vec2<f32>(1.0, 0.0),
          vec2<f32>(0.0, 1.0),
          vec2<f32>(1.0, 1.0)
        );
        return vec4<f32>(pos[vertexIndex], 0.0, 1.0);
      }
    `;

    const fragmentShaderCode = `
      @group(0) @binding(0) var ySampler: sampler;
      @group(0) @binding(1) var uSampler: sampler;
      @group(0) @binding(2) var vSampler: sampler;
      @group(0) @binding(3) var yTexture: texture_2d<f32>;
      @group(0) @binding(4) var uTexture: texture_2d<f32>;
      @group(0) @binding(5) var vTexture: texture_2d<f32>;

      @stage(fragment)
      fn main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
        let uv = fragCoord.xy / vec2<f32>(textureDimensions(yTexture).xy);
        let y = textureSample(yTexture, ySampler, uv).r;
        let u = textureSample(uTexture, uSampler, uv).r;
        let v = textureSample(vTexture, vSampler, uv).r;
        let r = y + 1.402 * (v - 0.5);
        let g = y - 0.344136 * (u - 0.5) - 0.714136 * (v - 0.5);
        let b = y + 1.772 * (u - 0.5);
        return vec4<f32>(r, g, b, 1.0);
      }
    `;

    const vertexModule = new ShaderModule(this.device, vertexShaderCode);
    const fragmentModule = new ShaderModule(this.device, fragmentShaderCode);

    this.pipeline = new Pipeline(this.device, {
      vertex: vertexModule,
      fragment: fragmentModule,
      layout: 'auto',
    });
  }

  private createTextures() {
    this.yTexture = new Texture(this.device, {
      format: 'r8unorm',
      size: [this.device.canvas.width, this.device.canvas.height, 1],
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    this.uTexture = new Texture(this.device, {
      format: 'r8unorm',
      size: [this.device.canvas.width / 2, this.device.canvas.height / 2, 1],
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    this.vTexture = new Texture(this.device, {
      format: 'r8unorm',
      size: [this.device.canvas.width / 2, this.device.canvas.height / 2, 1],
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
  }

  private createBuffers() {
    const vertices = new Float32Array([
      // 位置   // UV
      -1.0, -1.0, 0.0, 0.0,
       1.0, -1.0, 1.0, 0.0,
      -1.0, 1.0, 0.0, 1.0,
       1.0, 1.0, 1.0, 1.0,
    ]);

    const indices = new Uint16Array([
      0, 1, 2,
      2, 1, 3,
    ]);

    this.vertexBuffer = this.device.createBuffer({
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.vertexBuffer.getMappedRange()).set(vertices);
    this.vertexBuffer.unmap();

    this.indexBuffer = this.device.createBuffer({
      size: indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint16Array(this.indexBuffer.getMappedRange()).set(indices);
    this.indexBuffer.unmap();
  }

  public updateYUVTexture(yData: Uint8Array, uData: Uint8Array, vData: Uint8Array) {
    this.device.queue.writeTexture(
      { texture: this.yTexture },
      yData,
      { bytesPerRow: this.device.canvas.width },
      [this.device.canvas.width, this.device.canvas.height, 1]
    );

    this.device.queue.writeTexture(
      { texture: this.uTexture },
      uData,
      { bytesPerRow: this.device.canvas.width / 2 },
      [this.device.canvas.width / 2, this.device.canvas.height / 2, 1]
    );

    this.device.queue.writeTexture(
      { texture: this.vTexture },
      vData,
      { bytesPerRow: this.device.canvas.width / 2 },
      [this.device.canvas.width / 2, this.device.canvas.height / 2, 1]
    );

    this.render();
  }

  private render() {
    const commandEncoder = this.device.createCommandEncoder();

    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: this.device.getCurrentTexture().createView(),
        loadValue: { r: 0, g: 0, b: 0, a: 1 },
        storeOp: 'store',
      }],
    });

    passEncoder.setPipeline(this.pipeline);
    passEncoder.setVertexBuffer(0, this.vertexBuffer);
    passEncoder.setIndexBuffer(this.indexBuffer, 'uint16');
    passEncoder.drawIndexed(6, 1, 0, 0, 0);

    passEncoder.endPass();

    this.device.queue.submit([commandEncoder.finish()]);
  }
}
