import { injectable, inject, Container, LazyServiceIdentifer } from 'inversify';
import { TYPES } from '../../serviceFactories/symbol';
// import AudioWaveService from '../audio/audioWaveService';
import WavePlayerService from '../audio/wavePlayer';
import WaveGl from '../renderingEngines/webgl-waveform-visualization';
import type { IWavePlayerConfig, IWavePlayerExtend } from '../../types/services';


@injectable()
class WaveVisualization {
  canvas_el: HTMLCanvasElement;
  canvas_context: CanvasRenderingContext2D;
  gl_context: WebGLRenderingContext;
  // resizeObserver: ResizeObserver;
  contentEl?: HTMLElement;
  config?: IWavePlayerConfig;
  extend?: IWavePlayerExtend;
  renderType: number;
  waveGl: WaveGl;
  // audioWaveService: AudioWaveService;
  WavePlayerService: WavePlayerService;

  constructor(
    @inject(TYPES.IWavePlayerService) WavePlayerService: WavePlayerService,
    ) {
  this.WavePlayerService = WavePlayerService;
  }

  init(config?: IWavePlayerConfig, extend?: IWavePlayerExtend) {
    const defaultConfig = {
      routes: 32,
      contentEl: '',
      isMocking: false,
      renderType: 3,
      duration: 4,
      updateArrayLength: 160,
      width: 3000 * 1,
      height: 50 * 32,
      updateArrayTimes: 20,
      renderTimes: 20,
      arrayLength: 8000 * 4,
      converLiveData: false,
      fftsize: 512,
      mirrorMode: false,
      expandGlBuffer: 3,
    };
    const defaultextend = {
      showid: true,
      showAllid: false,
      terminalid: new Array(defaultConfig.routes),
      id: new Array(defaultConfig.routes),
      style: {
        position: 'absolute',
        color: 'rgb(255, 255, 255)',
        width: '100%',
        borderBlockStart: '1px solid #31352E',
      },
    };
    // let { routes, contentEl, isMocking = false, renderType = 1, duration = 4, updateArrayLength = 160, width = 3000 * 1, height = 50 * 32, updateArrayTimes = 20, renderTimes = 20, arrayLength = duration * 1000 / updateArrayTimes } = defaultConfig;
    this.config = Object.assign(defaultConfig, config);
    this.extend = Object.assign(defaultextend, extend);
    // debugger;
    const { renderType } = this.config;
    this.renderType = renderType;
    // this.extend = extend;
    this.canvas_el = document.createElement('canvas');
    this.contentEl = this.config.contentEl;
    const height = this.contentEl.clientHeight;
    const width = this.contentEl.clientWidth;
    this.canvas_el.height = height;
    this.canvas_el.width = width;
    this.contentEl.append(this.canvas_el);
    // this.WavePlayerService.init(Object.assign(config, { canvas_el: this.canvas_el }));
    this.WavePlayerService.init(this);
  }
  destroy() {
    if (this.WavePlayerService) {
      this.WavePlayerService.destroy();
      this.WavePlayerService = null;
    }
    this.canvas_el = null;
  }
}
export default WaveVisualization;
