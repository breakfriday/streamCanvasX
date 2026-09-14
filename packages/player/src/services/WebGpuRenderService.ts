
  class WebGPURenderer {
    private device: GPUDevice;
    private context: GPUCanvasContext;
    private canvas: HTMLCanvasElement;

    constructor(canvas: HTMLCanvasElement) {
      // 初始化WebGPU

      this.canvas = canvas;

      this.initGpu();
    }

    async initGpu() {
        if (!navigator.gpu) {
            throw Error('WebGPU not supported.');
          }
          const adapter = await navigator.gpu.requestAdapter();
          if (!adapter) {
            throw Error("Couldn't request WebGPU adapter.");
          }
          this.device = await adapter.requestDevice();

          const context = this.canvas.getContext('webgpu');
    }
  }
