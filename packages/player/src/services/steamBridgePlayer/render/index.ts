
import { injectable, inject, Container, LazyServiceIdentifer } from 'inversify';
import PlayerService from '../index';
import YuvEngine from './yunEngine';
import LoadingView from './plugin/loadingView';
import MainThreadCanvasView from './plugin/mainThreadView';

@injectable()
class MediaRenderEngine {
  playerService: PlayerService;
  yuvEngine: YuvEngine;
  loadingView: LoadingView;
  mainThreadCanvasView: MainThreadCanvasView

  init(playerService: PlayerService) {
    this.playerService=playerService;
    this.resignPlugin();
    this.setContentStyle();
  }


  setContentStyle() {
    let { contentEl } = this.playerService.config;
    contentEl.style.position="relative";
    contentEl.style.overflow="hidden";
  }

  resignPlugin() {
    let { playerService } = this;
    if(this.playerService.enableWorker!=true) {
      this.initYuvEngine();
    }

    this.loadingView=new LoadingView();
    this.loadingView.init(playerService);

    if(this.playerService.enableWorker===true) {
      this.mainThreadCanvasView=new MainThreadCanvasView();
      this.mainThreadCanvasView.init(playerService);
      this.mainThreadCanvasView.load();
    }
  }
  initYuvEngine() {
    let { playerService } = this;
    this.yuvEngine=new YuvEngine();
    this.yuvEngine.init(playerService);
  }

  drawLoading() {
    if(this.loadingView.isLoading===true) {
      return false;
    }
    this.loadingView.load();
  }
  clearLoading() {
    this.loadingView.destroy();
  }

  destroy() {
    if(this.yuvEngine) {
      this.yuvEngine.destroy();
    }
    this.loadingView.destroy();
    if(this.mainThreadCanvasView) {
      this.mainThreadCanvasView.destroy();
    }
  }

    // 绘制 YUV 视频帧
}


export default MediaRenderEngine;

