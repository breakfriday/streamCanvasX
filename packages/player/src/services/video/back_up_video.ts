
import { injectable, inject, Container, LazyServiceIdentifer } from 'inversify';
import PlayerService from '../player';
import createREGL from 'regl';
import REGL from 'Regl';

import WebGLYUVRenderer from './WebGLColorConverter';
import type { GPUDevice, GPUSampler, GPURenderPipeline, GPUCanvasContext } from '../../types/services/webGpu';

import { UseMode } from '../../constant';
import { loadWASM } from '../../utils';

import ControlPanel from "./plugin/contrlPannel";
function createContextGL($canvas: HTMLCanvasElement): WebGLRenderingContext | null {
    let gl: WebGLRenderingContext | null = null;

    const validContextNames: string[] = ['webgl', 'experimental-webgl', 'moz-webgl', 'webkit-3d'];
    let nameIndex = 0;

    while (!gl && nameIndex < validContextNames.length) {
      const contextName: string = validContextNames[nameIndex];

      try {
        let contextOptions: WebGLContextAttributes = { preserveDrawingBuffer: true };
        gl = $canvas.getContext(contextName, contextOptions) as WebGLRenderingContext;
      } catch (e) {
        gl = null;
      }

      if (!gl || typeof gl.getParameter !== 'function') {
        gl = null;
      }

      ++nameIndex;
    }

    return gl;
  }


@injectable()
class CanvasVideoService {
    canvas_el: HTMLCanvasElement;
    canvas_el2: HTMLCanvasElement;
    offscreen_canvas: OffscreenCanvas;
    canvas_context: CanvasRenderingContext2D;
    canvas_context2: CanvasRenderingContext2D;
    offscreen_canvas_context: OffscreenCanvasRenderingContext2D;
    context2D: CanvasRenderingContext2D;
    playerService: PlayerService;
    contextGl: WebGLRenderingContext;
    device: GPUDevice;
    GpuContext: GPUCanvasContext;
    renderPipeline: GPURenderPipeline;
    regGl: REGL.Regl;
    useMode: UseMode;
    sampler: GPUSampler;
    contentEl: HTMLElement;
    clear: boolean;
    loading: boolean;
    frameInfo: VideoFrame;
    resizeObserver: ResizeObserver;
    videoFrame: VideoFrame;
    transformCount: number;
    transformDegreeSum: number;
    rotateDegreeSum: number;
    cover: boolean;
    WatermarkModule;
    isDrawingWatermark: boolean;
    isGettingWatermark: boolean;

    constructor() {
        this.canvas_el = document.createElement('canvas');

        // canvas_el2 用于录制原始高清视频
        this.canvas_el2 = document.createElement('canvas');

        this.canvas_el.style.position = 'absolute';
        // this._initContext2D();

        // this.init();
        // this.setCanvasSize();
    }

    event() {
      // 监听 dom size 变化， 调整canvas 大小
      this.resizeObserver = new ResizeObserver(() => {
        setTimeout(() => {
           this.setCanvasSize();
          //  this.resizeControlPannel();
        }, 20);
      });

      this.resizeObserver.observe(this.contentEl);
    }

    init(playerService: PlayerService, data: {model?: UseMode; contentEl?: HTMLElement | null; useOffScreen: boolean}) {
        // this.initGpu();
        //  this.setUseMode(UseMode.UseCanvas);
        //  this.setUseMode(UseMode.UseWebGPU);
        this.playerService = playerService;
        let { model = UseMode.UseCanvas, contentEl } = data || {};


          this.setUseMode(model);
          if (contentEl) {
            this.contentEl = contentEl;
            this.setCanvasSize();
            this.contentEl.append(this.canvas_el);

            this.event();
          }

        //  this.setUseMode(UseMode.UseWebGPU);
        // this.setUseMode(UseMode.UseCanvas);

         switch (this.useMode) {
            case UseMode.UseCanvas:
                this._initContext2D();
                break;
            case UseMode.UseWebGL:
                this.initgl();
                break;
            case UseMode.UseWebGPU:
                this.initGpu();
            break;
        }


        // this.initgl();
    }

    load(video: HTMLVideoElement){

      this.createVideoFramCallBack(video)
      this.resignPlugin()
    }
    setUseMode(mode: UseMode): void {
        this.useMode = mode;
      }

    initgl() {
        this.regGl = createREGL({ canvas: this.canvas_el, extensions: ['OES_texture_float'] });
    }

    async drawGl(frame: VideoFrame) {
        let ImageBitmap = await createImageBitmap(frame);
        const texture = this.regGl.texture(frame);


        const draw = this.regGl({
            frag: `
              precision mediump float;
              uniform sampler2D texture;
              varying vec2 uv;
              void main () {
                gl_FragColor = texture2D(texture, uv);
              }
            `,
            vert: `
              precision mediump float;
              attribute vec2 position;
              varying vec2 uv;
              void main () {
                uv = position;
                gl_Position = vec4(2.0 * position - 1.0, 0, 1);
              }
            `,
            attributes: {
              position: [[0, 0], [0, 1], [1, 1], [0, 0], [1, 1], [1, 0]],
            },
            uniforms: {
              texture: texture,
            },
            count: 6,
          });

          this.regGl.clear({ color: [0, 0, 0, 1] });


          draw(texture);
          texture.destroy();
    }

    _initContext2D() {
      if (this.playerService.config.useOffScreen === true) {
        // let offscreenCanvas = this.canvas_el.transferControlToOffscreen();
        // this.offscreen_canvas = offscreenCanvas;
        // 不能在主线程中  获取上下问
        // this.offscreen_canvas_context = offscreenCanvas.getContext('2d');
      } else {
        this.canvas_context = this.canvas_el.getContext('2d');
      }
       // this.canvas_context = this.canvas_el.getContext('2d');
    }
    async _initWatermark() {
      // 获取wasm Module
      let $this = this;
      this.WatermarkModule = await loadWASM('watermark.js', 'createWatermark');
      // debugger;
      this.WatermarkModule['watermarkArnoldDCT'] = function (pixelData: Uint8ClampedArray, width: number, height: number, watermarkData: Uint8ClampedArray, size: number, count: number) {
        const len = pixelData.length;
        const len2 = watermarkData.length;
        const mem = $this.WatermarkModule._malloc(len + len2);
        $this.WatermarkModule.HEAPU8.set(pixelData, mem);
        $this.WatermarkModule.HEAPU8.set(watermarkData, mem + len);
        $this.WatermarkModule._watermarkArnoldDCT(mem, width, height, mem + len, size, count);
        const filtered = $this.WatermarkModule.HEAPU8.subarray(mem, mem + len);
        $this.WatermarkModule._free(mem);
        return filtered;
      };
      this.WatermarkModule['watermarkArnoldIDCT'] = function (pixelData: Uint8ClampedArray, width: number, height: number, watermarkData: Uint8ClampedArray, size: number, count: number) {
        const len = pixelData.length;
        const len2 = size * size * 4;
        const mem = $this.WatermarkModule._malloc(len + len2);
        $this.WatermarkModule.HEAPU8.set(pixelData, mem);
        $this.WatermarkModule.HEAPU8.set(watermarkData, mem + len);
        $this.WatermarkModule._watermarkArnoldIDCT(mem, width, height, mem + len, size, count);
        // const filtered = HEAPU8.subarray(mem, mem+len);  // 返回图像
        const filtered2 = $this.WatermarkModule.HEAPU8.subarray(mem + len, mem + len + len2); // 返回水印
        $this.WatermarkModule._free(mem);
        return filtered2;
      };
    }
    // _initOffScreen() {
    //   let offscreenCanvas = this.canvas_el.transferControlToOffscreen();
    //   this.canvas_context = offscreenCanvas.getContext('2d');
    // }


    async initGpu() {
        if (!navigator.gpu) {
            throw Error('WebGPU not supported.');
          }
          const adapter = await navigator.gpu.requestAdapter();
          if (!adapter) {
            throw Error("Couldn't request WebGPU adapter.");
          }
          this.device = await adapter.requestDevice();

          this.GpuContext = this.canvas_el.getContext('webgpu');

          // navigator.gpu.getPreferredCanvasFormat() 返回最适合当前设备和环境的WebGPU canvas上下文的颜色格式
          const presentationFormat = navigator.gpu.getPreferredCanvasFormat();


          this.GpuContext.configure({
            device: this.device,
            format: presentationFormat,
            alphaMode: 'premultiplied',
          });

            // Create a basic vertex shader
            const vertexShader = `@group(0) @binding(0) var mySampler : sampler;
            @group(0) @binding(1) var myTexture : texture_2d<f32>;
            
            struct VertexOutput {
              @builtin(position) Position : vec4<f32>,
              @location(0) fragUV : vec2<f32>,
            }
            
            @vertex
            fn vert_main(@builtin(vertex_index) VertexIndex : u32) -> VertexOutput {
              const pos = array(
                vec2( 1.0,  1.0),
                vec2( 1.0, -1.0),
                vec2(-1.0, -1.0),
                vec2( 1.0,  1.0),
                vec2(-1.0, -1.0),
                vec2(-1.0,  1.0),
              );
            
              const uv = array(
                vec2(1.0, 0.0),
                vec2(1.0, 1.0),
                vec2(0.0, 1.0),
                vec2(1.0, 0.0),
                vec2(0.0, 1.0),
                vec2(0.0, 0.0),
              );
            
              var output : VertexOutput;
              output.Position = vec4(pos[VertexIndex], 0.0, 1.0);
              output.fragUV = uv[VertexIndex];
              return output;
            }
            
            @fragment
            fn frag_main(@location(0) fragUV : vec2<f32>) -> @location(0) vec4<f32> {
              return textureSample(myTexture, mySampler, fragUV);
            }`;

        // Create a basic fragment shader
        const fragmentShader = `@group(0) @binding(1) var mySampler: sampler;
        @group(0) @binding(2) var myTexture: texture_external;
        
        @fragment
        fn main(@location(0) fragUV : vec2<f32>) -> @location(0) vec4<f32> {
          return textureSampleBaseClampToEdge(myTexture, mySampler, fragUV);
        }`;


      // 创建渲染管道
            this.renderPipeline = this.device.createRenderPipeline({
                    layout: 'auto',
                    vertex: {
                        module: this.device.createShaderModule({
                            code: vertexShader,
                        }),
                        entryPoint: 'vert_main',
                    },
                    fragment: {
                        module: this.device.createShaderModule({
                            code: fragmentShader,
                        }),
                        entryPoint: 'main',
                        targets: [{
                            format: presentationFormat,
                        }],
                    },

                    primitive: {
                        topology: 'triangle-list',
                      },
                    // primitive: { topology: 'triangle-strip', stripIndexFormat: 'uint16' },
                });


            this.sampler = this.device.createSampler({
                magFilter: 'linear',
                minFilter: 'linear',
            });
    }

    async renderFrameByWebgpu(frame: VideoFrame | HTMLVideoElement) {
        let $this = this;
        const uniformBindGroup = $this.device.createBindGroup({
            layout: $this.renderPipeline.getBindGroupLayout(0),
            entries: [
              {
                binding: 1,
                resource: this.sampler,
              },
              {
                binding: 2,
                resource: this.device.importExternalTexture({
                  source: frame as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                }),
              },
            ],
          });


          const commandEncoder = this.device.createCommandEncoder();
          const textureView = this.GpuContext.getCurrentTexture().createView();

          const renderPassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [
              {
                view: textureView,
                clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                loadOp: 'clear',
                storeOp: 'store',
              },
            ],
          };


        // 创建指令池
        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
        passEncoder.setPipeline(this.renderPipeline);
        passEncoder.setBindGroup(0, uniformBindGroup);
        passEncoder.draw(6, 1, 0, 0);
        passEncoder.end();
        this.device.queue.submit([commandEncoder.finish()]);
    }


    async drawFrameByWebgpu() {

        // this.GpuContext.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

    }


    setCanvasEL(el: HTMLCanvasElement) {
        this.canvas_el = document.createElement('canvas');
    }

    setCanvasSize() {
      let height = 200;
      let width = 400;

      // if (this.playerService.config.useOffScreen == true) {
      //   return false;
      // }


      if (this.contentEl) {
        height = this.contentEl.clientHeight;
        width = this.contentEl.clientWidth;
      }

        this.canvas_el.width = width;
        this.canvas_el.height = height;
    }
    setCanvas2Size(parm: {width: number; height: number}) {
       let { width, height } = parm;
      this.canvas_el2.width = width;
      this.canvas_el2.height = height;
    }

    _initContextGl() {
        this.contextGl = createContextGL(this.canvas_el);
        const webgl = WebGLYUVRenderer(this.contextGl, true);
        // this.contextGlRender = webgl.render;
        // this.contextGlDestroy = webgl.destroy;
    }


    render(videoFrame: VideoFrame | HTMLVideoElement) {
      this.videoFrame = videoFrame as VideoFrame;
        switch (this.useMode) {
            case UseMode.UseCanvas:
                this.renderCanvas2d(videoFrame);
                break;
            case UseMode.UseWebGL:
                this.renderGl(videoFrame);
                break;
            case UseMode.UseWebGPU:
                this.renderFrameByWebgpu(videoFrame);
            break;
        }


       // this.renderFrameByWebgpu(videoFrame);

    //    this.drawGl(videoFrame);
    }

    renderGl(videoFrame: VideoFrame) {
        // Define a REGL command to render the video frame.
        let { regGl } = this;
        const drawImage = this.regGl({
            frag: `
            precision mediump float;
            uniform sampler2D texture;
            varying vec2 uv;
            void main () {
                gl_FragColor = texture2D(texture, uv);
            }
            `,
            vert: `
            precision mediump float;
            attribute vec2 position;
            varying vec2 uv;
            void main () {
                uv = position;
                gl_Position = vec4(1.0 - 2.0 * position, 0, 1);
            }
            `,
            attributes: {
                position: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
            },
            uniforms: {
                texture: regGl.prop('texture'),
              },
            count: 4,
        });
    }

    setCover(cover: boolean = false) {
     this.cover = cover;
    }
    drawCenteredScaledVideoFrame(videoFrame: VideoFrame | HTMLVideoElement) {
      let video = videoFrame as HTMLVideoElement;
      let video_height = video.videoHeight;
      let video_width = video.videoWidth;


      let width = 400;
      let height = 200;

      if (this.contentEl) {
        width = this.contentEl.clientWidth;
        height = this.contentEl.clientHeight;
      }
      // Calculate scale ratio for the video
      let scaleRatio = Math.min(width / video_width, height / video_height);

      // Calculate the target video dimensions after scaling
      let targetVideoWidth = video_width * scaleRatio;
      let targetVideoHeight = video_height * scaleRatio;


      // Calculate the position to center the video frame on the canvas
      let offsetX = (width - targetVideoWidth) / 2;
      let offsetY = (height - targetVideoHeight) / 2;

      this.canvas_context.drawImage(videoFrame, offsetX, offsetY, targetVideoWidth, targetVideoHeight);
    }
    renderCanvas2d(videoFrame: VideoFrame | HTMLVideoElement) {
        // let video_width = videoFrame.codedHeight;
        // let video_height = videoFrame.codedHeight;
        let video = videoFrame as HTMLVideoElement;

        let width = 400;
        let height = 200;

        if (this.contentEl) {
          width = this.contentEl.clientWidth;
          height = this.contentEl.clientHeight;
        }
        const centerX = width / 2;
        const centerY = height / 2;
        // let ctx = this.canvas_context;
        // let { canvas_el } = this;
        // let canvas = canvas_el;
        // ctx.save();

        // this.canvas_context.clearRect(0, 0, width, height);
        // 取消cover后使用clearRect(0, 0, width, height)不能完全清除
        this.canvas_context.clearRect(0, centerY - centerX, width, width); // 当 width > height 时，有效
        // let clearStart = -Math.abs(centerX - centerY);
        // let clearSize = Math.max(3 * centerX - centerY, 3 * centerY - centerX);
        // this.canvas_context.clearRect(clearStart, clearStart, clearSize, clearSize); // 无需讨论 width height的大小关系，均有效

        if (this.cover === true && (this.rotateDegreeSum === 90 || this.rotateDegreeSum === 270)) {
          // this.canvas_context.drawImage(videoFrame, centerX - centerY, centerY - centerX, centerX + centerY, centerX + centerY);
          this.canvas_context.drawImage(videoFrame, centerX - centerY, centerY - centerX, height, width);
        } else if (this.cover === true) {
          this.canvas_context.drawImage(videoFrame, 0, 0, width, height);
        } else {
            this.drawCenteredScaledVideoFrame(videoFrame);
        }
        // this.drawTrasform(30);


        let video_height = video.videoHeight;
        let video_width = video.videoWidth;

        if (this.playerService.canvasToVideoSerivce.recording === true) {
          if (!this.canvas_context2) {
            this.canvas_context2 = this.canvas_el2.getContext('2d');
            this.setCanvas2Size({ width: video_width, height: video_height });
          }
          this.canvas_context2.clearRect(0, 0, video_width, video_height);

          // this.drawTrasform(30);
          this.canvas_context2.drawImage(videoFrame, 0, 0, video_width, video_height);
        }


        // this.drawTrasform(videoFrame, 30, ctx);
        if (this.isDrawingWatermark) {
          this.drawInvisibleWatermark(this.isDrawingWatermark, {});
          this.getInvisibleWatermark(this.isGettingWatermark, {});
        }

        // ctx.restore();
        // console.log(this.playerService.config.degree);
        // this.drawTrasform(videoFrame, this.playerService.config.degree);

        // ctx.restore();
        this.renderOriginCanvas(videoFrame);
    }

    // 录制原始高清视频
    renderOriginCanvas(videoFrame: VideoFrame | HTMLVideoElement) {
      let video = videoFrame as HTMLVideoElement;
      if (this.playerService.canvasToVideoSerivce.recording === true) {
        let video_height = video.videoHeight;
        let video_width = video.videoWidth;
        if (!this.canvas_context2) {
          this.canvas_context2 = this.canvas_el2.getContext('2d');
          this.setCanvas2Size({ width: video_width, height: video_height });
        }
        this.canvas_context2.clearRect(0, 0, video_width, video_height);

        // this.drawTrasform(30);
        this.canvas_context2.drawImage(videoFrame, 0, 0, video_width, video_height);
      }
    }

    getCanvas2dEl() {
        return this.canvas_el;
    }


 

    createVideoFramCallBack(video: HTMLVideoElement) {
      let $this = this;

      let fpsCount = 5;
      let frame_count = 0;
      let start_time = 0.0;
      let now_time = 0.0;
      let fps = 0;

      function millisecondsToTime(ms: any) {
        // 将时间戳转换为秒并取整
        let seconds = Math.floor(ms / 1000);

        // 计算小时数、分钟数和秒数
        let hours = Math.floor(seconds / 3600);
        let minutes = Math.floor((seconds - (hours * 3600)) / 60);
         seconds = seconds - (hours * 3600) - (minutes * 60);

        // 如果只有一位数字，前面补0
        if (hours < 10) { hours = `0${hours}`; }
        if (minutes < 10) { minutes = `0${minutes}`; }
        if (seconds < 10) { seconds = `0${seconds}`; }

        // 返回格式化的字符串
        return `${hours}:${minutes}:${seconds}`;
      }
      let cb = () => {
        video.requestVideoFrameCallback((now) => {
            // $this.renderFrameByWebgpu(video);
            let last_time = now_time;
            if (start_time == 0.0) {
              start_time = now;
            }
            now_time = now;
            // let last_time = performance.now();

            let elapsed = (now_time - last_time) / 1000.0;
            // 每经过fpsCount帧后，输出一次当前的瞬时帧率
            if (!(frame_count % fpsCount)) {
              fps = (1 / elapsed).toFixed(3);
            }
            frame_count++;

            let performanceInfo = { fps: fps, duringtime: millisecondsToTime(now - start_time) };
            // console.info(performanceInfo);

            $this.playerService.emit('performaceInfo', performanceInfo);
            $this.render(video);
          cb();
        });
      };
      cb();

 
    }

    clearCanvas() {
      if (this.playerService.config.useOffScreen === true) {
        return false;
      }
      let canvasEl = this.canvas_el;
      this.clear = true;
      // 清除画布
      this.canvas_context.clearRect(0, 0, canvasEl.width, canvasEl.height);
    }

    resignPlugin(){
      let contentEl=this.contentEl
      let video=this.playerService.meidiaEl


      if(this.playerService.config.hasControl===true){
        let control=new ControlPanel(video,contentEl);
        control.load()
      }

      

    }

    drawLoading() {
      if (this.playerService.config.useOffScreen === true) {
        return false;
      }
      let ctx = this.canvas_context;
      let { canvas_el } = this;
      let canvas = canvas_el;
      let timeId: any = null;
      if (this.loading === true) {
        return false;
      }

      // Define the circle radius and line width
      const radius = 50;
      const lineWidth = 10;

      // Initialize the start and end angles of the arc progress bar
      let startAngle = 0;
      let endAngle = 0;
      let $this = this;

      this.loading = true;

      let drawAnimation = () => {
        // Define the center coordinates of the circle
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        if (this.loading === false) {
          clearTimeout(timeId);
          return false;
        }
        if ($this.clear === true) {
          // this.destory()
          clearTimeout(timeId);
          $this.clearCanvas();
          return false;
        }
        // Clear the canvas content to prepare for drawing a new frame
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw the background circle
        ctx.beginPath(); // Begin a new path
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI); // Draw a full circle
        ctx.lineWidth = lineWidth; // Set the line width
        ctx.strokeStyle = 'rgba(200, 200, 200, 0.5)'; // Set the line color
        ctx.stroke(); // Stroke the path

        // Draw the loading progress arc
        ctx.beginPath(); // Begin a new path
        ctx.arc(centerX, centerY, radius, startAngle * Math.PI, endAngle * Math.PI); // Draw an arc
        ctx.lineWidth = lineWidth; // Set the line width
        ctx.strokeStyle = 'rgba(50, 150, 255, 1)'; // Set the line color
        ctx.stroke(); // Stroke the path

        // Update the start and end angles of the arc progress bar for the next frame
        startAngle += 0.01;
        endAngle += 0.02;

        // When the angle reaches 2π, reset it to 0
        if (startAngle >= 2) {
          startAngle = 0;
        }

        if (endAngle >= 2) {
          endAngle = 0;
        }

        // Use the setTimeout function to recursively call drawLoading() to achieve animation effect
        timeId = setTimeout(drawAnimation, 1000 / 30); // Approximate 60 FPS
      };

      drawAnimation();
    }

    // 绕中心翻转任意角度   角度制输入  通过先上下翻转然后旋转实现翻转任意角度
    // drawTrasform(videoFrame: VideoFrame | HTMLVideoElement,degree: number, ctx:any){
    //   let { canvas_el } = this;
    //   let canvas = canvas_el;
    //   // ctx.save();
    //   // // this.canvas_context.clearRect(0, 0, canvas.width, canvas.height);
    //   // ctx.translate(0, canvas.height);  //初版使用                                                                                                       进行翻转 但是因为 scale()实现的上下翻转 会导致后续的旋转方向相反
    //   // ctx.scale(1,-1);
    //   // // ctx.restore();
    //   // this.drawRotate(2 * degree);

    //   // let width = canvas.width;
    //   // let height = canvas.height;
    //   // canvas.width = width;
    //   // canvas.height = height;

    //   this.canvas_context.clearRect(0, 0, canvas.width, canvas.height);
    //   // let img0 = ctx.getImageData(0, 0, canvas.width, canvas.height);
    //   ctx.drawImage(videoFrame, 0, 0, canvas.width, canvas.height);
    //   let img1 = ctx.getImageData(0, 0, canvas.width, canvas.height);
    //   // console.log(img0);
    //   let img2 = ctx.getImageData(0, 0, canvas.width, canvas.height);
    //   this.canvas_context.clearRect(0, 0, canvas.width, canvas.height);
    //   // console.log(typeof img);
    //   // console.log(img);
    //   // console.log(degree);

    //   // this.drawRotate(2 * degree,ctx);
    //   // ctx.putImageData(this.imagePxTrasform(img2, img1), 0, 0);
    //   // this.drawRotate(-2 * degree,ctx);
    //   // console.log(this);

    //   // // ctx.save();
    //   const centerX = canvas.width / 2;
    //   const centerY = canvas.height / 2;
    //   ctx.translate(centerX, centerY);
    //   ctx.rotate((Math.PI / 180) * degree * 2);
    //   ctx.translate(-centerX, -centerY);
    //   // ctx.drawImage(videoFrame, 0, 0, canvas.width, canvas.height);
    //   img1=this.imagePxTrasform(img2, img1);
    //   // ctx.putImageData(this.imagePxTrasform(img2, img1), 0, 0); //putImageData方法生成的图形似乎无法使用clearRect方法清除
    //   ctx.putImageData(img1, 0, 0);
    //   // ctx.fill();
    //   // ctx.beginPath();
    //   // // ctx.restore();

    //   // ctx.translate(centerX, centerY);
    //   // ctx.rotate((Math.PI / 180) * degree * -2);
    //   // ctx.translate(-centerX, -centerY);
    // };
    drawTrasform(degree: number) {
      this.transformCount = this.transformCount ? this.transformCount : 0;
      this.transformCount = (this.transformCount + 1) % 2;
      // console.log(this.transformCount);
      this.transformDegreeSum = this.transformDegreeSum ? this.transformDegreeSum : 0;
      degree = degree ? Number(degree) : 0;
      this.transformDegreeSum = (this.transformDegreeSum + degree) % 180;
      // 和初版实现相似   translate()scale()rotate()和transform()应该类似
      // 那么翻转后再调用旋转操作时旋转方向改变的问题 应无法通过改变翻转方式来解决
      let ctx = this.canvas_context;
      // ctx.restore(); // restore(),save()重置画布  添加之后可在render中直接调用drawTrasform()
      // ctx.save();
      let { canvas_el } = this;
      let canvas = canvas_el;
      let deg = Math.PI / 180; // 角度转化为弧度
      degree = this.transformCount == 0 ? -2 * degree : 2 * degree;
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      this.canvas_context.clearRect(0, 0, canvas.width, canvas.height);
      ctx.translate(centerX, centerY);
      ctx.transform(Math.cos(deg * degree), Math.sin(deg * degree), -Math.sin(deg * degree), Math.cos(deg * degree), 0, 0);
      ctx.translate(-centerX, -centerY);
      ctx.transform(1, 0, 0, -1, 0, canvas.height);
    }
    transformReset() {
      let ctx = this.canvas_context;
      let { canvas_el } = this;
      let canvas = canvas_el;
      let degree = (180 - this.transformDegreeSum);
      let deg = Math.PI / 180;
      if (this.transformCount) {
        ctx.transform(1, 0, 0, -1, 0, canvas.height);
      }
      // degree = this.transformCount == 0 ? 2 * degree : -2 * degree;
      degree = 2 * degree;
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      this.canvas_context.clearRect(0, 0, canvas.width, canvas.height);
      ctx.translate(centerX, centerY);
      ctx.transform(Math.cos(deg * degree), Math.sin(deg * degree), -Math.sin(deg * degree), Math.cos(deg * degree), 0, 0);
      ctx.translate(-centerX, -centerY);
      this.transformDegreeSum = 0;
      this.transformCount = 0;
    }
    drawVerticalMirror() { // 对旋转90 180 270 的图像垂直镜像
      let degree = this.rotateDegreeSum ? this.rotateDegreeSum : 0;
      this.drawTrasform(0 - degree);
      this.transformDegreeSum = (this.transformDegreeSum + 2 * degree) % 180;
    }
    drawHorizontalMirror() { // 对旋转90 180 270 的图像水平镜像
      let degree = this.rotateDegreeSum ? this.rotateDegreeSum : 0;
      this.drawTrasform(90 - degree);
      this.transformDegreeSum = (this.transformDegreeSum + 2 * degree) % 180;
    }
    // 绕中心旋转任意角度   角度制输入
    // drawRotate(degree: number, ctx){
    //   // let ctx = this.canvas_context;
    //   let { canvas_el } = this;
    //   let canvas = canvas_el;
    //   const centerX = canvas.width / 2;
    //   const centerY = canvas.height / 2;
    //   // this.canvas_context.clearRect(0, 0, canvas.width, canvas.height);
    //   ctx.translate(centerX, centerY);
    //   ctx.rotate((Math.PI / 180) * degree);
    //   ctx.translate(-centerX, -centerY);
    // };
    drawRotate(degree: number) {
      let ctx = this.canvas_context;
      // ctx.restore();
      // ctx.save();
      let { canvas_el } = this;
      let canvas = canvas_el;
      degree = degree ? Number(degree) : 0;
      this.transformCount = this.transformCount ? this.transformCount : 0;
      this.rotateDegreeSum = this.rotateDegreeSum ? this.rotateDegreeSum : 0;
      this.rotateDegreeSum = (this.rotateDegreeSum + degree) % 360;
      degree = this.transformCount == 0 ? degree : -degree; // 消除翻转影响
      let deg = Math.PI / 180; // 角度转化为弧度
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      this.canvas_context.clearRect(0, 0, canvas.width, canvas.height);
      ctx.translate(centerX, centerY);
      ctx.transform(Math.cos(deg * degree), Math.sin(deg * degree), -Math.sin(deg * degree), Math.cos(deg * degree), 0, 0);
      ctx.translate(-centerX, -centerY);
    }
    rotateReset() {
      let ctx = this.canvas_context;
      let { canvas_el } = this;
      let canvas = canvas_el;
      let degree = (360 - this.rotateDegreeSum);
      degree = this.transformCount == 0 ? degree : -degree;
      let deg = Math.PI / 180;// 角度转化为弧度
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      this.canvas_context.clearRect(0, 0, canvas.width, canvas.height);
      ctx.translate(centerX, centerY);
      ctx.transform(Math.cos(deg * degree), Math.sin(deg * degree), -Math.sin(deg * degree), Math.cos(deg * degree), 0, 0);
      ctx.translate(-centerX, -centerY);
      this.rotateDegreeSum = 0;
    }

    // //翻转像素来实现图片翻转
    // imagePxTrasform(sourceData: ImageData, newData: ImageData) {
    //   for (var i = 0, h = sourceData.height; i < h; i++) {
    //     for (var j = 0, w = sourceData.width; j < w; j++) {
    //       newData.data[i * w * 4 + j * 4 + 0] =
    //         sourceData.data[(h - i) * w * 4 + j * 4 + 0];
    //       newData.data[i * w * 4 + j * 4 + 1] =
    //         sourceData.data[(h - i) * w * 4 + j * 4 + 1];
    //       newData.data[i * w * 4 + j * 4 + 2] =
    //         sourceData.data[(h - i) * w * 4 + j * 4 + 2];
    //       newData.data[i * w * 4 + j * 4 + 3] =
    //         sourceData.data[(h - i) * w * 4 + j * 4 + 3];
    //     }
    //   }
    //   return newData;
    // }


    // drawWatermark(){
    //   //获得播放器的canvas
    //   let ctx = this.canvas_context;
    //   let { canvas_el } = this;
    //   let canvas = canvas_el;

    //   //绘制水印
    //   const watermark = document.createElement('canvas');
    //   watermark.style.position = 'absolute';
    //   const watermarkSize = 50;
    //   watermark.width = watermarkSize;
    //   watermark.height = watermarkSize;
    //   const ctxWatermark = watermark.getContext('2d');
    //   ctxWatermark.textAlign = 'right';
    //   ctxWatermark.textBaseline = 'top';
    //   ctxWatermark.font = '12px Microsoft Yahei';
    //   ctxWatermark.fillStyle = 'rgba(255, 255, 255, 0.3)';
    //   ctxWatermark.rotate(-20 * Math.PI / 180);
    //   ctxWatermark.fillText('水印', 10, 20);

    //   //绘制水印图层
    //   const watermarkLayer = document.createElement('canvas');
    //   watermarkLayer.style.position = 'absolute';
    //   watermarkLayer.width = canvas.width;
    //   watermarkLayer.height = canvas.height;
    //   const ctxWatermarkLayer = watermarkLayer.getContext('2d');
    //   //ctxWatermarkLayer.drawImage(watermark,canvas.width - watermark.width, canvas.height - watermark.height);
    //   ctxWatermarkLayer.fillStyle = ctx.createPattern(watermark,'repeat');
    //   ctxWatermarkLayer.fillRect(0, 0, canvas.width, canvas.height);

    //   //在播放器的canvas后添加绘制好的水印图层
    //   let parentDiv = this.canvas_el.parentNode;
    //   parentDiv.appendChild(watermarkLayer);
    // }

    drawWatermark(watermarkConfig) {
      // 获得播放器的canvas
      let ctx = this.canvas_context;
      let { canvas_el } = this;
      let canvas = canvas_el;
      let { width = 50, height = 50, value = '水印', font = '12px Microsoft Yahei', color = 'rgba(255, 255, 255, 0.3)', degree = 20, fillStyle = 1 } = watermarkConfig || {};
      // 绘制水印
      const watermark = document.createElement('canvas');
      watermark.style.position = 'absolute';
      watermark.width = width;
      watermark.height = height;
      const ctxWatermark = watermark.getContext('2d');
      ctxWatermark.textAlign = 'left';
      ctxWatermark.textBaseline = 'top';
      ctxWatermark.font = font;
      ctxWatermark.fillStyle = color;
      ctxWatermark.rotate(-degree * Math.PI / 180);
      ctxWatermark.fillText(value, 0, 20);

      // 绘制水印图层
      const watermarkLayer = document.createElement('canvas');
      watermarkLayer.style.position = 'absolute';
      watermarkLayer.width = canvas.width;
      watermarkLayer.height = canvas.height;
      const ctxWatermarkLayer = watermarkLayer.getContext('2d');
      if (fillStyle == 1) {
        ctxWatermarkLayer.drawImage(watermark, canvas.width - width, 0);
      } else {
        ctxWatermarkLayer.fillStyle = ctx.createPattern(watermark, 'repeat');
        ctxWatermarkLayer.fillRect(0, 0, canvas.width, canvas.height);
      }
      watermarkLayer.classList.add('watermark');

      // 在播放器的canvas后添加绘制好的水印图层
      const parentDiv = this.canvas_el.parentNode;
      if (parentDiv.lastElementChild.classList.contains('watermark')) {
        parentDiv.removeChild(parentDiv.lastElementChild);
      }
      parentDiv.appendChild(watermarkLayer);
    }

    drawInvisibleWatermark(isDrawingWatermark: boolean, invisibleWatermarkConfig) {
      if (!this.WatermarkModule) {
        this._initWatermark();
      }
      let ctx = this.canvas_context;
      let { canvas_el } = this;
      let canvas = canvas_el;
      let { size = 50, src = './watermark.png', count = 0 } = invisibleWatermarkConfig || {};
      let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      if (isDrawingWatermark) {
      const invisibleWatermark = document.createElement('canvas');
      invisibleWatermark.style.position = 'absolute';
      invisibleWatermark.width = size;
      invisibleWatermark.height = size;
      const ctxInvisibleWatermark = invisibleWatermark.getContext('2d');
      const invisibleWatermarkImg = new Image();
      invisibleWatermarkImg.src = src;
      ctxInvisibleWatermark.drawImage(invisibleWatermarkImg, 0, 0);
      let invisibleWatermarkData = ctxInvisibleWatermark.getImageData(0, 0, invisibleWatermark.width, invisibleWatermark.height);
      let result = this.WatermarkModule.watermarkArnoldDCT(imageData.data, canvas.width, canvas.height,
                     invisibleWatermarkData.data, size, count);
      for (let i = 0; i < canvas.width * canvas.height * 4; i++) {
        imageData.data[i] = result[i];
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.putImageData(imageData, 0, 0);
      // ctx.drawImage(invisibleWatermarkImg, 0, 0, size, size);
      // console.log('drawInvisibleWatermark');
    }
    }

    getInvisibleWatermark(isGettingWatermark: boolean, invisibleWatermarkConfig) {
      if (!this.WatermarkModule) {
        this._initWatermark();
      }
      let ctx = this.canvas_context;
      let { canvas_el } = this;
      let canvas = canvas_el;

      let { size = 50, count = 0 } = invisibleWatermarkConfig || {};
      if (isGettingWatermark) {
      let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let invisibleWatermarkData = new ImageData(size, size);
      let result = this.WatermarkModule.watermarkArnoldIDCT(imageData.data, canvas.width, canvas.height,
                      invisibleWatermarkData.data, size, count);
      for (let i = 0; i < size * size * 4; i++) {
        invisibleWatermarkData.data[i] = result[i];
      }
      // ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.putImageData(invisibleWatermarkData, canvas.width - size, 0);
      // console.log('getInvisibleWatermark');
    }
    }
    // drawLoading() {
    //   let ctx = this.canvas_context;
    //   let { canvas_el } = this;
    //   let canvas = canvas_el;

    //   // 定义圆的半径和线宽
    //   const radius = 50;
    //   const lineWidth = 10;

    //   // 初始化弧形进度条的起始角度和结束角度
    //   let startAngle = 0;
    //   let endAngle = 0;
    //   let $this = this;

    //   this.loading = true;

    //   let drawAnimation = () => {
    //     // 定义圆心的坐标
    //     const centerX = canvas.width / 2;
    //     const centerY = canvas.height / 2;
    //     if (this.loading === false) {
    //       return false;
    //     }
    //     if ($this.clear === true) {
    //       // this.destory()
    //       $this.clearCanvas();
    //       return false;
    //     }
    //     // 清除画布内容，准备绘制新的帧
    //     ctx.clearRect(0, 0, canvas.width, canvas.height);

    //     // 绘制背景圆圈
    //     ctx.beginPath(); // 开始新路径
    //     ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI); // 画一个完整的圆
    //     ctx.lineWidth = lineWidth; // 设置线宽
    //     ctx.strokeStyle = 'rgba(200, 200, 200, 0.5)'; // 设置线条颜色
    //     ctx.stroke(); // 描边路径

    //     // 绘制loading进度弧形
    //     ctx.beginPath(); // 开始新路径
    //     ctx.arc(centerX, centerY, radius, startAngle * Math.PI, endAngle * Math.PI); // 画一个弧形
    //     ctx.lineWidth = lineWidth; // 设置线宽
    //     ctx.strokeStyle = 'rgba(50, 150, 255, 1)'; // 设置线条颜色
    //     ctx.stroke(); // 描边路径

    //     // 更新弧形进度条的起始角度和结束角度，用于下一帧的绘制
    //     startAngle += 0.01;
    //     endAngle += 0.02;

    //     // 当角度达到2π时，将其重置为0
    //     if (startAngle >= 2) {
    //       startAngle = 0;
    //     }

    //     if (endAngle >= 2) {
    //       endAngle = 0;
    //     }

    //     // 使用requestAnimationFrame()函数递归调用drawLoading()，实现动画效果
    //     requestAnimationFrame(drawAnimation);
    //   };


    //   drawAnimation();
    // }

    destroy() {
      if (this.playerService.config.showAudio === true) {
        this.playerService.audioProcessingService.clearCanvas();
      }
      if (this.canvas_el && this.contentEl) {
        this.canvas_el.remove();
        this.contentEl = null;
      }
    }

    drawError() {
      // this.playerService.mpegtsPlayer.destroy();
      // this.playerService.audioProcessingService.clearCanvas();
      // this.clearCanvas();

      let canvasContext = this.canvas_context;
      let canvas = this.canvas_el;
      let { errorUrl = '' } = this.playerService.config;

      let errorImg = new Image();
      errorImg.src = errorUrl;

      errorImg.onload = function () {
        let width = canvas.width * 0.5;

          errorImg.width = width;


        let startY = (canvas.height - width) / 2;
        let startX = (canvas.width - width) / 2;
        canvasContext.drawImage(errorImg, startX, startY, width, width);
    };
    }
}


export default CanvasVideoService;
