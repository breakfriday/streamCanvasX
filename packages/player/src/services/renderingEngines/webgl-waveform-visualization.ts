
import { injectable, inject, Container, LazyServiceIdentifer } from 'inversify';
// import PlayerService from '../player';
import createREGL from 'regl';
// import BaseRenderEnging from './baseEngine';
import WavePlayerService from '../audio/wavePlayer';
import LiveAudio from './liveAudio';


function expandArrayEfficient(inputArray: Float32Array): Float32Array {
  // 创建一个新的ArrayBuffer，长度是原数组的两倍
  const buffer = new ArrayBuffer(inputArray.length * 2 * Float32Array.BYTES_PER_ELEMENT);
  const expandedArray = new Float32Array(buffer);

  // 使用单个循环进行填充
  for (let i = 0, j = 0; i < inputArray.length; i++) {
      expandedArray[j++] = inputArray[i];
      expandedArray[j++] = inputArray[i];
  }

  return expandedArray;
}


// 減少循環次數 充分利用了现代 JavaScript 引擎对于内置方法的优化。但是將數普通数组和回到 Float32Array 的过程中可能会有一些性能开销
// function expandArrayEfficient(arr: Float32Array): Float32Array {
//   // 将 Float32Array 转换为普通数组并应用 map
//   const doubledArray = Array.from(arr).flatMap(n => [n, n]);

//   // 使用 Float32Array.from() 从结果数组创建新的 Float32Array
//   return Float32Array.from(doubledArray);
// }

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
    heightScaleBuffer: createREGL.Buffer;
    waveformTextures: Array<createREGL.Texture2D>;
    totalWaveforms: number;
    bufferLength: number; // 每一路音频数据的长度
    bufferData: Array<Float32Array>;// 32 路音频数据的data
    liveAudio: LiveAudio;
    converLiveData: boolean;
    mirrorMode: boolean;
    glIndexOffset: number[]; // 绘制起点的偏移量数组
    expandGlBuffer: number; // glbuffer扩充的倍数  最小值为 1  glBuffer[i].length = bufferData[i].length * expandGlBuffer
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
      let { converLiveData, routes, fftSize, mirrorMode, expandGlBuffer } = this.wavePlayerService.config;

      this.converLiveData = converLiveData;
      this.mirrorMode = mirrorMode;

      this.expandGlBuffer = Math.max(expandGlBuffer, 1);
      this.glIndexOffset = new Array(this.totalWaveforms).fill(0);
        this.initgl();
        this.initData();
        if (converLiveData === true) {
          this.liveAudio = new LiveAudio(routes, fftSize, (data) => {
            let newData = data;
            this.updataData(newData);
          });
        }
    }

    // initgl() {
    //      this.regGl = createREGL({ canvas: this.canvas_el });
    //      let regl = this.regGl;


    //      this.drawCommand = this.regGl({
    //       frag: `
    //       precision highp float;
    //       uniform vec4 color;
    //       void main() {
    //         gl_FragColor = vec4(0.47, 1.0, 0.0, 1.0);
    //       }`,

    //       vert: `
    //       precision highp float;
    //       attribute vec2 position;
    //       uniform float yOffset; // 波形的垂直偏移
    //       uniform float yScale;  // 波形的垂直缩放
    //       void main() {
    //         gl_PointSize = 10.0;
    //         gl_Position = vec4(position, 0, 1);
    //       }`,
    //       attributes: {
    //         // position: this.glBuffer,
    //         position: regl.prop('buffer'),
    //       },

    //       count: this.bufferLength * 2,
    //       depth: { enable: true },
    //       primitive: 'line strip',

    //      });

    //      if (!this.glBuffer) {
    //       this.glBuffer = [];
    //       for (let i = 0; i < this.totalWaveforms; i++) {
    //         this.glBuffer[i] = this.regGl.buffer({ type: 'float', usage: 'dynamic', length: this.bufferLength * 4 });
    //       }
    //     }
    //     // if (!this.xglBuffer) {
    //     //   this.xglBuffer = this.regGl.buffer({ type: 'float', usage: 'static', length: this.bufferLength * 2 });
    //     // }
    // }

    initgl() {
      this.regGl = createREGL({ canvas: this.canvas_el, extensions: ['OES_texture_float', 'angle_instanced_arrays'] });
      let regl = this.regGl;
      let indices = Array.from({ length: this.bufferLength }, (_, k) => k); // 创建索引数组
      // let indices: Array<number>;
      if (this.mirrorMode === true) {
        console.log('开启对称渲染 注意性能问题');
      }
      let vertexIndexBuffer = regl.buffer(indices);

      // 着色器程序
      this.drawCommand = regl({
        frag: `
        precision highp float;
        void main() {
          gl_FragColor = vec4(0.47, 1.0, 0.0, 1.0);
        }`,

        vert: `
        precision highp float;
        attribute float pcmData; // 音频数据作为属性
        attribute float vertexIndex; // 顶点索引
        uniform sampler2D waveformTexture; // 波形纹理 其中存储音频数据
        attribute float heightScale;  // 波形的垂直缩放
        uniform float verticalOffset; // 波形的垂直偏移
        uniform float count; // 音頻點总数
               
        void main() {
      
          float scaleX = 2.0 / (count - 1.0);
          //int pcmIndex = int(vertexIndex) / 2; // 计算 pcmData 的索引
          float x = vertexIndex * scaleX - 1.0; // 计算 x 坐标
          float y = pcmData * heightScale + verticalOffset; // 原始点的 y 坐标
               
          gl_Position = vec4(x, y, 0.0, 1.0);
        }`,

        uniforms: {
          verticalOffset: regl.prop('verticalOffset'),
          count: regl.prop('count'), // 音频点数
      },
        attributes: {
          heightScale: {
            buffer: regl.prop('heightScale'),
            divisor: 1, // 每次实例化选取1个值
          },

          pcmData: regl.prop('buffer'),
          vertexIndex: vertexIndexBuffer, // 顶点索引
        },

        instances: regl.prop('instances'), // 实例化绘制次数
        count: regl.prop('pointCounts'), // 實際定點數
        depth: { enable: true },
        primitive: 'line strip',
      });

      // 创建存储音频数据的 GLBuffer
      if (!this.glBuffer) {
        this.glBuffer = [];
        for (let i = 0; i < this.totalWaveforms; i++) {
          this.glBuffer[i] = this.regGl.buffer({ type: 'float', usage: 'dynamic', length: this.bufferLength * Float32Array.BYTES_PER_ELEMENT * this.expandGlBuffer });
        }
      }
      if (!this.heightScaleBuffer) {
        const heightPerWaveform = 2 / this.totalWaveforms;
        const heightScale = new Float32Array([heightPerWaveform * 0.3, heightPerWaveform * -0.3]);
        this.heightScaleBuffer = this.regGl.buffer({ type: 'float', usage: 'static', length: 2 * Float32Array.BYTES_PER_ELEMENT });
        this.heightScaleBuffer(heightScale);
      }
    }


      // updateVertBuffer() {
      //   const heightPerWaveform = 2 / this.totalWaveforms; // 分配给每一路的高度空间
      //   const heightScale = heightPerWaveform * 0.3; // 实际波形的高度缩放
      //   let verticalOffset = 1 - heightPerWaveform / 2; // 从最顶部的波形开始计算垂直偏移

      //   for (let i = 0; i < this.totalWaveforms; i++) {
      //     let pcmData = this.bufferData[i];

      //     // // 扩展两倍 方便對稱渲染，
      //     // if (this.mirrorMode === true) {
      //     //  pcmData = expandArrayEfficient(pcmData);
      //     // }


      //     this.glBuffer[i](pcmData); // 直接将音频数据存储到 GLBuffer
      //     verticalOffset -= heightPerWaveform; // 更新偏移量
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


      render() {
        let { mirrorMode } = this;
        let regl = this.regGl;
        regl.frame(() => {
          regl.clear({
            color: [0, 0, 0, 1],
            depth: 1,
          });

          const heightPerWaveform = 2 / this.totalWaveforms;
          let verticalOffset = 1 - heightPerWaveform / 2;
          let instances = mirrorMode ? 2 : 1;

          for (let i = 0; i < this.totalWaveforms; i++) {
            this.drawCommand({
              buffer: {
                buffer: this.glBuffer[i],
                offset: this.glIndexOffset[i] * Float32Array.BYTES_PER_ELEMENT,
              },
              instances: instances,
              count: this.bufferData[i].length, // 实际音频点数
              heightScale: this.heightScaleBuffer,
              verticalOffset: verticalOffset,
              pointCounts: this.bufferData[i].length, // 顶点数
            });

            verticalOffset -= heightPerWaveform;
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
        this.heightScaleBuffer.destroy();
        this.regGl.destroy();
      }

      inputData(data: Array<Float32Array>) {
        if (this.converLiveData === true) {
          this.liveAudio.receiveData(data);
          return false;
        }
        let shiftAppendTypedArray = (bufferData: Float32Array, dataArray: Float32Array) => {
          bufferData.copyWithin(0, dataArray.length);
          bufferData.set(dataArray, bufferData.length - dataArray.length);

          return { data: bufferData, lenght: dataArray.length };
        };

        for (let i = 0; i < data.length; i++) {
          shiftAppendTypedArray(this.bufferData[i], data[i]);

          if (this.glIndexOffset[i] + data[i].length >= this.bufferData[i].length * (this.expandGlBuffer - 1)) { // 更新glbuffer
            this.glIndexOffset[i] = 0;
            this.glBuffer[i].subdata(this.bufferData[i], 0);
          } else {
            this.glBuffer[i].subdata(data[i], (this.bufferData[i].length + this.glIndexOffset[i]) * Float32Array.BYTES_PER_ELEMENT);
            this.glIndexOffset[i] = this.glIndexOffset[i] + data[i].length;
          }
        }

        // this.updateVertBuffer();
      }
      updataData(data: Array<Float32Array>) {
        let shiftAppendTypedArray = (bufferData: Float32Array, dataArray: Float32Array) => {
          bufferData.copyWithin(0, dataArray.length);
          bufferData.set(dataArray, bufferData.length - dataArray.length);

          return { data: bufferData, lenght: dataArray.length };
        };

        for (let i = 0; i < data.length; i++) {
          shiftAppendTypedArray(this.bufferData[i], data[i]);

          if (this.glIndexOffset[i] + data[i].length >= this.bufferData[i].length * (this.expandGlBuffer - 1)) { // 更新glbuffer
            this.glIndexOffset[i] = 0;
            this.glBuffer[i].subdata(this.bufferData[i], 0);
          } else {
            this.glBuffer[i].subdata(data[i], (this.bufferData[i].length + this.glIndexOffset[i]) * Float32Array.BYTES_PER_ELEMENT);
            this.glIndexOffset[i] = this.glIndexOffset[i] + data[i].length;
          }
        }

        // this.updateVertBuffer();
      }
}


export default CanvasWaveService;
