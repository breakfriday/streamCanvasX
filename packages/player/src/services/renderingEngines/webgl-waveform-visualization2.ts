
import { injectable, inject, Container, LazyServiceIdentifer } from 'inversify';
// import PlayerService from '../player';
import createREGL from 'regl';
// import BaseRenderEnging from './baseEngine';
import WavePlayerService from '../audio/wavePlayer';


@injectable()
class CanvasWaveService {
    canvas_el: HTMLCanvasElement;
    regGl: createREGL.Regl;
    canvas_context: CanvasRenderingContext2D;
    dataArray: Float32Array;
    // playerService: PlayerService;
    glContext: WebGLRenderingContext;
    wavePlayerService: WavePlayerService;
    drawCommand: createREGL.DrawCommand;
    // vertBuffer: Array<Float32Array>;
    vertBuffer: number[][];
    // xglBuffer: createREGL.Buffer;
    glBuffer: Array<createREGL.Buffer>;
    waveformTextures: Array<createREGL.Texture2D>;
    textureData: Array<Float32Array>;
    totalWaveforms: number;
    bufferLength: number; // 每一路音频数据的长度
    bufferData: Array<Float32Array>;// 32 路音频数据的data
    // updateLength: number; // 每次更新音频数据的长度
    // verticalOffsetArray: number[]; // 垂直偏移量
    constructor() {


    }

    init(wavePlayerService: WavePlayerService) {
       this.wavePlayerService = wavePlayerService;
       this.canvas_el = this.wavePlayerService.canvas_el;
       this.glContext = this.wavePlayerService.gl_context;
       this.totalWaveforms = this.wavePlayerService.config.routes;
       this.bufferLength = this.wavePlayerService.config.arrayLength;
      //  this.vertBuffer = [];


      this.initData();
      this.initgl();
       this.initTextures();
    }


    initgl() {
      this.regGl = createREGL({ canvas: this.canvas_el, extensions: ['OES_texture_float'] });
      let regl = this.regGl;


      this.drawCommand = regl({
          frag: `
          precision highp float;
          void main() {
              gl_FragColor = vec4(0.47, 1.0, 0.0, 1.0);
          }`,

          vert: `
          precision highp float;
          attribute float index; // 顶点ID用于确定样本索引
          uniform sampler2D waveformTexture; // 波形纹理 其中存储音频数据
          uniform float yOffset; // 垂直偏移
          uniform float yScale; // 垂直缩放
          uniform float totalPoints; // 总点 数纹理中的样本总数
  
          void main() {
            float adjustedIndex = floor(index / 2.0); // 调整索引
            bool isUpperHalf = mod(index, 2.0) < 1.0; // 判断是上半部还是下半部
        
            float x = (adjustedIndex / (totalPoints - 1.0)) * 2.0 - 1.0; // 计算x位置  将索引转换为[-1, 1]范围
            float y = texture2D(waveformTexture, vec2(adjustedIndex / totalPoints, 0.0)).r; // 从纹理获取y值
            y = (y - 0.5) * yScale + yOffset; // 缩放和偏移y值
        
            if (!isUpperHalf) {
                y = -y + 2.0 * yOffset; // 对于下半部分，反转y值
            }
        
            gl_Position = vec4(x, y, 0.0, 1.0); // 设置顶点位置
            gl_PointSize = 2.0; // 设置点大小
          }`,

          attributes: {
              index: regl.prop('indices'),
          },

          uniforms: {
              waveformTexture: regl.prop('waveformTexture'),
              yOffset: regl.prop('yOffset'),
              yScale: regl.prop('yScale'),
              // totalPoints: regl.context('totalPoints'),
              totalPoints: regl.prop('totalPoints'),
          },

          count: regl.prop('count'),
          primitive: 'line strip',
      });
  }


      initTextures() {
        this.waveformTextures = [];


        for (let i = 0; i < this.totalWaveforms; i++) {
            this.waveformTextures[i] = this.regGl.texture({
              data: new Float32Array(this.bufferLength),
              width: this.bufferLength,
              height: 1,
              format: 'luminance', // 或 'r32f' 在 WebGL 2.0 中
              type: 'float',
              min: 'nearest',
              mag: 'nearest',
              wrap: 'clamp',
            });
        }
    }

    updateTextureData(data: Array<Float32Array>) {
        for (let i = 0; i < this.totalWaveforms; i++) {
            this.waveformTextures[i].subimage({
                data: data[i],
                format: 'luminance',
                type: 'float',
            });
        }
    }


      // updateVertBuffer() {
      //   const { totalWaveforms } = this;
      //   const heightPerWaveform = 2 / (totalWaveforms); // 分配给每一路的高度空间
      //   const heightScale = heightPerWaveform * 0.3; // 实际波形的高度缩放，留出空间以避免相互重叠,最大不能超过0.5，否则放大会导致波形重叠
      //   const verticalOffsetIncrement = heightPerWaveform;
      //   let verticalOffset = 1 - verticalOffsetIncrement / 2; // 从最顶部的波形开始计算垂直偏移

      //   for (let i = 0; i < this.totalWaveforms; i++) {
      //     // let pcmData = this.bufferData[i].subarray(this.bufferData[i].length - this.updateLength);
      //     let pcmData = this.bufferData[i];

      //     let data = this.convertPCMToVertices(pcmData, heightScale, verticalOffset);
      //     // this.vertBuffer[i].copyWithin(0, 2 * this.updateLength);
      //     // this.vertBuffer[i].set(data, 2 * (this.bufferData[i].length - this.updateLength));
      //     // this.glBuffer[i](this.vertBuffer[i]);
      //     this.glBuffer[i](data);
      //     verticalOffset -= verticalOffsetIncrement; // 更新偏移量，为下一路波形准备
      //   }
      // }


      // PCM数据点转换为对称于X轴的两组顶点数据
      // convertPCMToVertices(pcmData: Float32Array, heightScale: number, verticalOffset: number) {
      //   const sampleCount = pcmData.length;
      //   // const vertices = new Float32Array(sampleCount * 2);
      //   const vertices = [];

      //   for (let index = 0; index < sampleCount; index++) {
      //     const x = (index / (sampleCount - 1)) * 2 - 1; // 将索引规范化到[-1, 1]
      //     const y = (pcmData[index] * heightScale) + verticalOffset;

      //     // 添加原始点
      //     vertices.push(x, y);
      //     // vertices[2 * index] = (y);
      //     // 添加沿x轴对称的点
      //     vertices.push(x, -y + 2 * verticalOffset);
      //     // vertices[2 * index + 1] = (-y + 2 * verticalOffset);
      //   }

      //   return vertices;
      // }


      // render() {
      //        // regl.clear({
      //     //   color: [0, 0, 0, 1],
      //     //   depth: 1,
      //     // });
      //   // this.dataArray = this.generateSineWave();
      //   this.canvas_el.style.backgroundColor = 'black';
      //   let regl = this.regGl;
      //   regl.frame(() => {
      //     // regl.clear({
      //     //   color: [0, 0, 0, 1],
      //     //   depth: 1,
      //     // });


      //     // console.log('------');


      //     for (let i = 0; i < this.totalWaveforms; i++) {
      //       let glbuffer = this.glBuffer[i].length;

      //       let count = this.bufferData[i].length * 2;

      //       this.drawCommand({ count: count, buffer: this.glBuffer[i] });
      //     }
      //   });
      // }


      render() {
        const { totalWaveforms } = this;
        let regl = this.regGl;
        const yOffsetStep = 2.0 / this.totalWaveforms;
        let yOffset = 1.0 - yOffsetStep / 2.0;
        const yScale = yOffsetStep * 0.3;

        regl.frame(() => {
          regl.clear({
            color: [0, 0, 0, 1],
            depth: 1,
          });
            for (let i = 0; i < this.totalWaveforms; i++) {
              let length = this.bufferLength;
                this.drawCommand({
                    waveformTexture: this.waveformTextures[i],
                    yOffset: yOffset,
                    yScale: yScale,
                    count: this.bufferLength * 2,
                    indices: Array.from({ length: this.bufferLength }, (_, k) => k),
                    totalPoints: this.bufferLength,
                });
                yOffset -= yOffsetStep;
            }
        });
    }


      initData() {
        let routes = this.totalWaveforms;
        let length = this.bufferLength;
        this.bufferData = [];
        for (let i = 0; i < routes; i++) {
          this.bufferData[i] = new Float32Array(length);
        }
        // this.initVertBuffer();
        // this.initXVertBuffer();
      }


      destroy() {
        // this.xglBuffer.destroy();
        for (let i = 0; i < this.totalWaveforms; i++) {
          this.glBuffer[i].destroy();
        }
        this.regGl.destroy();
      }

      inputData(data: Array<Float32Array>) {
        let shiftAppendTypedArray = (bufferData: Float32Array, dataArray: Float32Array) => {
          bufferData.copyWithin(0, dataArray.length);
          bufferData.set(dataArray, bufferData.length - dataArray.length);

          return { data: bufferData, lenght: dataArray.length };
        };

        let count = this.bufferData.length;
        for (let i = 0; i < count; i++) {
          shiftAppendTypedArray(this.bufferData[i], data[i]);
        }

        this.updateTextureData(this.bufferData);

        // this.updateVertBuffer();
      }
}


export default CanvasWaveService;