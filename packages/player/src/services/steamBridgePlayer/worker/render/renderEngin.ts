import createREGL from 'regl';
import { MessageType } from '../../const';

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

class YuvEnging {
    canvas_el: OffscreenCanvas;
    regGl: createREGL.Regl;
    canvas_context: CanvasRenderingContext2D;
    glContext: WebGLRenderingContext;
    drawCommand: createREGL.DrawCommand;
    // yuv 紋理數據， 可以直接通過紋理對象 動態直接更新紋理，不要再dramCpmmand 中傳入
    yuvTexture: {
        textureY: createREGL.Texture2D;
        textureU: createREGL.Texture2D;
        textureV: createREGL.Texture2D;

    }
    private coverMode: boolean;
    private canvasAspectRatio: number; // 图像的宽高比

    private rotationAngle: number = 0; // 旋转角度，默认为0
    hasTexture: boolean
    contextHealth: boolean
    lostContext: WEBGL_lose_context;
    yuvResolution: {
      current: { actualRowWidth: number };
      previous: { actualRowWidth: number };
    }
    offscreenCanvas_width: number
    offscreenCanvas_height: number;
    enableTransferControlCanvs: boolean
    constructor() {

    }
    // init(data?: {width: number;height: number}) {
    //     let { width,height }=data;
    //     this.offscreenCanvas_height=height;
    //     this.offscreenCanvas_width=width;

    //     this.canvasAspectRatio=1;
    //     this.rotationAngle=0;
    //     this.initCanvas();
    //     this.initRegl();
    //     this.coverMode=false;
    //     this.yuvResolution={
    //       current: { actualRowWidth: 0 },previous: { actualRowWidth: 0 }
    //     };
    // }
    setRotation(angle: number) {
      this.rotationAngle = angle; // 更新角度
      // 可以在这里触发重绘，如果需要实时更新
  }
  initTransferControlCanvs(canvas: OffscreenCanvas,opt?: {width: number;height: number}) {
      let { width ,height } = canvas;
      if(opt) {
        width=opt.width;
        height=opt.height;
      }
      this.offscreenCanvas_height=height;
      this.offscreenCanvas_width=width;
      this.enableTransferControlCanvs=true;

      this.canvasAspectRatio=width/height;

      this.rotationAngle=0;
      this.canvas_el=canvas;
      this.initRegl();
      this.coverMode=false;
      this.yuvResolution={
            current: { actualRowWidth: 0 },previous: { actualRowWidth: 0 }
          };
      this.canvas_el.addEventListener('webglcontextlost', (event) => { this.handleContextLost(event); }, false);
      this.canvas_el.addEventListener('webglcontextrestored', (event) => { this.handleContextRestored(event); }, false);
  }
  initNewOffscreenCanvs(data?: {width: number;height: number}) {
    let { width,height }=data;
    this.offscreenCanvas_height=height;
    this.offscreenCanvas_width=width;
    this.enableTransferControlCanvs=false;

    this.canvasAspectRatio=1;
    this.rotationAngle=0;
    this.initCanvas();
    this.initRegl();
    this.coverMode=false;
    this.yuvResolution={
      current: { actualRowWidth: 0 },previous: { actualRowWidth: 0 }
    };
  }
   drawRotate(angle: number) {
    this.rotationAngle = angle; // 更新角度
   }

    setCover(cover: boolean) {
      this.coverMode = cover;
  }
    initCanvas() {
        // this.offscreenCanvas_height=400;
        // this.offscreenCanvas_width=800;
        this.canvas_el = new OffscreenCanvas(this.offscreenCanvas_width,this.offscreenCanvas_height);

        // this.setCanvasSize();

        this.canvasAspectRatio= this.offscreenCanvas_width / this.offscreenCanvas_height; // 更新画布宽高比

        this.canvas_el.addEventListener('webglcontextlost', (event) => { this.handleContextLost(event); }, false);
        this.canvas_el.addEventListener('webglcontextrestored', (event) => { this.handleContextRestored(event); }, false);
    }


    initRegl() {
    //   if (!this.regGl.hasExtension('WEBGL2')) {
    //     debugger
    //     console.error('WebGL2 is not supported by your browser.');
    // }

        this.glContext=this.canvas_el.getContext('webgl2');
        this.lostContext=this.glContext.getExtension('WEBGL_lose_context');
        this.regGl = createREGL({
          canvas: this.canvas_el,
          gl: this.glContext,
          attributes: {
            alpha: false, // 禁用画布的透明度，因为它可能影响性能
            antialias: true, // 根据需要启用或禁用抗锯齿
            depth: false, // 如果不需要深度缓存，可以禁用以节省资源
            stencil: false,
            preserveDrawingBuffer: false,
            powerPreference: 'high-performance', // 倾向于使用高性能的图形处理器
            premultipliedAlpha: false,
            desynchronized: true, // 减少延迟

          }
      });


        let regl=this.regGl;
        const textureY = regl.texture({ width: 1, height: 1, format: 'luminance' }); // 存储视频帧的亮度（Y分量）信息
        const textureU = regl.texture({ width: 1, height: 1, format: 'luminance' }); // 存储色度信息
        const textureV = regl.texture({ width: 1, height: 1, format: 'luminance' }); // 存储色度信息


        this.yuvTexture={ textureU,textureY,textureV };

        // 将yuv 数据转换为RGB
        this.drawCommand=regl({
            frag: `
              precision mediump float;
              varying vec2 uv;   //纹理坐标，由顶点着色器计算-> 片段着色器
              uniform sampler2D textureY;
              uniform sampler2D textureU;
              uniform sampler2D textureV;
              uniform float validWidthRatioY;
              void main() {
                vec2 adjustedUV = vec2(uv.x * validWidthRatioY, uv.y);
                float y = texture2D(textureY, adjustedUV ).r;  //从textureY纹理中根据uv坐标采样颜色，然后提取其RGB颜色值存储到变量y中
                float u = texture2D(textureU, adjustedUV ).r - 0.5; 
                float v = texture2D(textureV, adjustedUV ).r - 0.5;

                float r = y + 1.403 * v;
                float g = y - 0.344 * u - 0.714 * v;
                float b = y + 1.770 * u;

                gl_FragColor = vec4(r, g, b, 1.0);

                // gl_FragColor = vec4(y + 1.403 * v, y - 0.344 * u - 0.714 * v, y + 1.77 * u, 1.0);  // 最终 標準公式 计算转换成rgb  1.0 表示不透明
                
              }
            `,
            vert: `
            attribute vec2 position;
            varying vec2 uv;
            uniform float canvasAspectRatio;
            uniform float videoAspectRatio;
            uniform bool coverMode;
            uniform float rotation;  // 旋转角度，以度为单位
            void main() {
                vec2 adjustedPosition = position;

                if (coverMode) {
                  float scale = max(canvasAspectRatio / videoAspectRatio, 1.0);
                  adjustedPosition.x *= scale;
                  adjustedPosition.y *= scale / (canvasAspectRatio / videoAspectRatio);
                }else{
                  if (videoAspectRatio > canvasAspectRatio) {
                    adjustedPosition.y = position.y * (canvasAspectRatio / videoAspectRatio);
                  } else {
                    adjustedPosition.x = position.x * (videoAspectRatio / canvasAspectRatio);
                }

              } 
             
                
              // 应用旋转矩阵
              float rad = radians(rotation);
              float cosAngle = cos(rad);
              float sinAngle = sin(rad);
              vec2 rotatedPosition = vec2(
                  adjustedPosition.x * cosAngle - adjustedPosition.y * sinAngle,
                  adjustedPosition.x * sinAngle + adjustedPosition.y * cosAngle
              );

              uv = position * 0.5 + 0.5;
              uv.y = 1.0 - uv.y; // 翻转Y轴
              gl_Position = vec4(rotatedPosition, 0, 1);
            }
            `,
            attributes: {
              position: [
                -1, -1, // bottom left
                1, -1, // bottom right
                -1, 1,// top left

                -1, 1, // top left
                1, -1,// bottom right
                1, 1] // top right
            },
          //   elements: [
          //     [0, 1, 2], // first triangle
          //     [2, 1, 3] // second triangle
          // ],
            uniforms: {
              // textureY: () => textureY,
              // textureU: () => textureU,
              // textureV: () => textureV
              textureY: regl.prop('textureY'),
              textureU: regl.prop('textureU'),
              textureV: regl.prop('textureV'),
              canvasAspectRatio: regl.prop('canvasAspectRatio'), // 从 regl 的 context 获取画布宽高比
              videoAspectRatio: regl.prop('videoAspectRatio'), // 从属性传递视频宽高比
              coverMode: regl.prop('coverMode'),
              rotation: regl.prop('rotationAngle'),
              validWidthRatioY: regl.prop("validWidthRatioY"),

            },
            count: 6
          });
    }
    handleContextLost = (event) => {
      this.contextHealth=false;
      let canvas = event.target;
      if(!!this.canvas_el===false) {
        this.canvas_el=canvas;
      }
      event.preventDefault(); // 防止默认的上下文丢失处理，使得可以进行自定义处理
      console.log("上下文丟失");
      // this.destroyGl();
     };

    handleContextRestored(event) {
      let canvas = event.target;
      if(!!this.canvas_el===false) {
        this.canvas_el=canvas;
      }
      this.initRegl();
      this.contextHealth=true;
      console.log(" handleContextRestored 上下文恢復");
    }
    // event() {
    //     this.setCanvasSize();
    // }
    setCanvasSize(data?: {width: number;height: number}) {
        // let height = this.offscreenCanvas_height;
        // let width = this.offscreenCanvas_width;
        let { width,height }=data;

        this.canvas_el.width=width;
        this.canvas_el.height=height;
        this.canvasAspectRatio= width / height; // 更新画布宽高比
        this.regGl.poll();

          // setTimeout(() => {
          //   this.regGl.poll();
          // }, 300);
    }


    update_yuv_texture(yuvFrame: YUVFrame) {
      if(this.contextHealth===false) {
        return false;
      }

      if(!!this.regGl===false) {
        return false;
      }

      let { validWidth ,actualRowWidth } = yuvFrame;
      const validWidthRatioY = validWidth / actualRowWidth; // 计算宽度比例


      if(actualRowWidth!=this.yuvResolution.previous.actualRowWidth) {
        this.yuvResolution.previous.actualRowWidth=actualRowWidth;
        this.clear();
        this.hasTexture=false;
        return false;
      }


      if(yuvFrame&&this.regGl) {
        let { yData, uData, vData,width,height }=yuvFrame;
        if(this.hasTexture) {
          this.yuvTexture.textureY.subimage({
            data: yData,
            width: width,
            height: height,
            type: 'uint8',
          });

          this.yuvTexture.textureU.subimage({
            data: uData,
            width: width/2,
            height: height/2,
            type: 'uint8',
          });


          this.yuvTexture.textureV.subimage({
            data: vData,
            width: width/2,
            height: height/2,
            type: 'uint8',
          });

          // 更新 U 纹理
        }else{
          this.yuvTexture.textureY({ data: yData, width, height, format: 'luminance',type: 'uint8', wrapS: "clamp",wrapT: 'clamp' });
          this.yuvTexture.textureU({ data: uData, width: width / 2, height: height / 2, format: 'luminance' ,type: 'uint8', wrapS: "clamp",wrapT: 'clamp' });
          this.yuvTexture.textureV({ data: vData, width: width / 2, height: height / 2, format: 'luminance',type: 'uint8', wrapS: "clamp",wrapT: 'clamp' });
          this.hasTexture=true;
        }

        this.drawCommand({
          textureY: this.yuvTexture.textureY,
          textureU: this.yuvTexture.textureU,
          textureV: this.yuvTexture.textureV,
          videoAspectRatio: width/height,
          canvasAspectRatio: this.canvasAspectRatio,
          coverMode: this.coverMode,
          rotationAngle: this.rotationAngle,
          validWidth,
          actualRowWidth,
          validWidthRatioY

        });

        if(this.enableTransferControlCanvs===true) {
          return false;
        }else{
        this.sendImageToMainThread();
        }
      }
}


    clear() {
      if(this.regGl) {
        let regl=this.regGl;
        regl.clear({
         color: [0, 0, 0, 0],
         depth: 1,
       });
      }
    }

    destroyGl() {
      try{
        this.yuvTexture.textureU.destroy();
        this.yuvTexture.textureY.destroy();
        this.yuvTexture.textureV.destroy();
      }catch(e) {

      }
      this.yuvTexture.textureU=null;
      this.yuvTexture.textureV=null;
      this.yuvTexture.textureY=null;
      try{
        this.regGl.destroy();
      }catch(e) {

      }
      this.regGl=null;
    }
    destroy() {
      this.clear();

      console.log("---------------");

      console.log("destroy","嘗試銷毀 webgl");

      console.log("---------------");

     this.destroyGl();


     this.canvas_el.width=0;
     this.canvas_el.height=0;
     // this.yuvTexture=null;

     this.lostContext.loseContext();

      this.canvas_context=null;

      if(this.canvas_el) {
        this.canvas_el=null;
      }
    }

    sendImageToMainThread() {
      const bitmap: ImageBitmap = this.canvas_el.transferToImageBitmap(); // 创建 ImageBitmap
      self.postMessage({ type: MessageType.RENDER_Main_THREAD,
        data: bitmap }, [bitmap]); // 发送 ImageBitmap 给主线程
  }
    sendImageBlObToMainThread() {
      this.canvas_el.convertToBlob().then(blob => {
        self.postMessage({ type: MessageType.RENDER_Main_THREAD,data: blob });
      });// 对于blob 不需要使用传输列表
    }


    // 這個reload 主要是在size 調整， 或者紋理數據大小發生變換的場景下使用。
    reload() {
      let canvas=this.canvas_el;
       this.clear();
       this.destroyGl();
       this.hasTexture=false;
       this.initTransferControlCanvs(canvas);
    }

    // 绘制 YUV 视频帧
}


export default YuvEnging;
