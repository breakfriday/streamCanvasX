import { injectable, inject, Container, LazyServiceIdentifer, id } from 'inversify';
import { TYPES } from '../../serviceFactories/symbol';
import AudioWaveService from './audioWaveService';
import WaveGl from '../renderingEngines/webgl-waveform-visualization';
import WaveVisualization from '../waveVisualization/waveVisualization';
import type { IWavePlayerConfig, IWavePlayerExtend } from '../../types/services';
import Scheduler from './scheduler';
import _ from 'lodash';


@injectable()
class WavePlayer {
  canvas_el: HTMLCanvasElement;
  canvas_context: CanvasRenderingContext2D;
  gl_context: WebGLRenderingContext;
  resizeObserver: ResizeObserver;
  contentEl?: HTMLElement;
  config?: IWavePlayerConfig;
  extend?: IWavePlayerExtend;
  waveVisualization: WaveVisualization;
  waveGl: WaveGl;
  updateBuffer: Float32Array;
  audioWaveService: AudioWaveService;
  renderType: number;
  scheduler: Scheduler;
  private throttledUpdate: (data: Float32Array[]) => void;

  constructor(
    @inject(TYPES.IAudioWaveService) audioWaveService: AudioWaveService,
    @inject(TYPES.IWaveGl) waveGl: WaveGl,
    ) {
  this.audioWaveService = audioWaveService;
  this.waveGl = waveGl;
  }

  init(waveVisualization?: WaveVisualization) {
    this.waveVisualization = waveVisualization;
    const { renderType } = waveVisualization.config;
    this.renderType = renderType;
    this.config = waveVisualization.config;
    this.extend = waveVisualization.extend;
    this.canvas_el = waveVisualization.canvas_el;
    this.contentEl = waveVisualization.contentEl;
    this.event();
    this.scheduler = new Scheduler(1);

   // this.throttledUpdate = _.throttle(this.update.bind(this), 1);

   let { updateArrayTimes } = this.config;
   this.throttledUpdate = _.throttle(this.updateInput.bind(this), updateArrayTimes);

    switch (renderType) {
      case 1: // canvas2d
        this.initContext2D();
        this.audioWaveService.init(this);
          break;
      case 2: // audioContext
          break;
      case 3: // webGL
        this.initgl();
        this.waveGl.init(this);
          break;
      default:
          break;
    }
    // debugger;
    // this.audioWaveService.init(config);
  }

  initContext2D() {
    this.canvas_context = this.canvas_el.getContext('2d');
  }
  initgl() {
    const gl = this.canvas_el.getContext('webgl');
    this.gl_context = gl;
  }

  event() {
      // 监听 dom size 变化， 调整canvas 大小
      this.resizeObserver = new ResizeObserver((entries) => {
        setTimeout(() => {
          switch (this.renderType) {
            case 1: // canvas2d
              this.setCanvasSize2(entries);
                break;
            case 2: // audioContext
                break;
            case 3: // webGL
              this.setCanvasSize();
                break;
            default:
                break;
          }
        }, 20);
      });
      this.resizeObserver.observe(this.contentEl);
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
    if (this.extend.showid) {
      this.showid();
      this.extend.showid = false;
    }
      this.setidSize();
  }
  setCanvasSize2(entries) {
        this.canvas_el.style.width = `${entries[0].contentRect.width}px`; // css 缩放目前可以解决模糊问题，但是对后续绘制影响有待研究
        this.canvas_el.style.height = `${this.canvas_el.height}px`;
  }
  showid() {
    const { height } = this.canvas_el;
    if (this.contentEl.hasChildNodes() && this.contentEl.firstChild.nodeName === 'CANVAS' && !this.contentEl.firstChild.nextSibling) {
      const { style } = this.extend;
      if (this.extend.showAllid) {
        for (let i = 0; i < this.config.routes; i++) {
          let div = document.createElement('div');
          let ids = document.createTextNode(`设备-${this.extend.terminalid[i]}通道-${this.extend.id[i]}`);
          div.appendChild(ids);
          // div.style = style;
          for (const prop in style) {
            div.style[prop] = style[prop];
          }
          div.style.top = `${i / this.config.routes * height + this.contentEl.offsetTop}px`;
          this.contentEl.appendChild(div);
        }
      } else {
        for (let i = 0; i < this.config.routes; i++) {
          let div = document.createElement('div');
          let ids = document.createTextNode(`通道-${this.extend.id[i]}`);
          div.appendChild(ids);
          for (const prop in style) {
            div.style[prop] = style[prop];
          }
          div.style.top = `${i / this.config.routes * height + this.contentEl.offsetTop}px`;
          this.contentEl.appendChild(div);
        }
      }
    } else {
      return;
    }
  }
  setidSize() {
    let count = 0;
    const { height } = this.canvas_el;
    let node = this.contentEl.firstElementChild as HTMLElement;
    while (node && node.nodeName !== 'DIV') {
      node = node.nextElementSibling as HTMLElement;
    }
    while (node?.nodeName === 'DIV') {
      node.style.top = `${count / this.config.routes * height}px`;
      node = node.nextElementSibling as HTMLElement;
      count++;
    }
  }
  updateInput(data: Array<Float32Array>) {
    // debugger;
    switch (this.renderType) {
      case 1: // canvas2d
        this.audioWaveService.updateArrayData(data);
        // this.audioWaveService.updateArrayData(); // mock
          break;
      case 2: // audioContext
          break;
      case 3: // webGL
        this.waveGl.inputData(data);
        // this.waveGl.render();
          break;
      default:
          break;
    }
  }

  update(data: Float32Array[]) {
     this.throttledUpdate(data);
  }

  triggerUpdate(data: Float32Array[]) {
    this.throttledUpdate(data);
  }

  hexArrayToFloat32Array(hexArray: Int16Array) {
    // 创建一个足够大的buffer来存放16位的PCM数据
    const buffer = new ArrayBuffer(hexArray.length * 2);
     // 使用一个DataView来操作ArrayBuffer
     const view = new DataView(buffer);

     // 16进制 转16位10进制整数
     hexArray.forEach((hex, i) => {
       const intValue = parseInt(hex, 16);
       // 将16位整数（假定为有符号）写入DataView
       view.setInt16(i * 2, intValue, true);
     });

     // 现在我们有了一个包含16位PCM数据的ArrayBuffer，创建一个16位整数数组来读取它
     const int16Array = new Int16Array(buffer);

     // 创建一个Float32Array来存放-1到1之间的浮点数
     const float32Array = new Float32Array(int16Array.length);

     // 归1化，转换16位整数范围到-1到1的浮点数
     for (let i = 0; i < int16Array.length; i++) {
       float32Array[i] = int16Array[i] / 32768;
     }

     return float32Array;
  }
  destroy() {
    if (this.audioWaveService) {
      this.audioWaveService.destroy();
      this.audioWaveService = null;
      this.canvas_context = null;
    }
    if (this.waveGl) {
      this.waveGl.destroy();
      this.waveGl = null;
      this.gl_context = null;
    }
    this.resizeObserver.disconnect();
  }
  glClear() {
    const { contentEl } = this;
    let ChildNode;
    if (contentEl.hasChildNodes()) {
        ChildNode = contentEl.firstChild;
    } else {
      return;
    }
    while (ChildNode.nodeName !== 'CANVAS' && ChildNode) {
    //   contentEl.removeChild(contentEl.firstChild);
        ChildNode = ChildNode.nextSibling;
    }
    if (ChildNode.nodeName === 'CANVAS') {
        contentEl.removeChild(ChildNode);
    }
  }
}
export default WavePlayer;
