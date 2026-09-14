
import { injectable, inject, Container, LazyServiceIdentifer } from 'inversify';
import PlayerService from '../player';


import { UseMode } from '../../constant';


import ControlPanel from './plugin/contrlPannel';


import MediaView from './plugin/mediaView';

import LoadingView from './plugin/loadingView';
import captureShot from './plugin/captureshot';

@injectable()
class CanvasVideoService {
    mediaView: MediaView;
    playerService: PlayerService;
    loadingView: LoadingView;

    constructor() {

    }

    init(playerService: PlayerService, data: {model?: UseMode; contentEl?: HTMLElement | null; useOffScreen: boolean}) {
      this.playerService = playerService;
      let { contentEl } = this.playerService.config;
      contentEl.style.position = 'relative';
      this.resignPlugin();
    }

    // 插件注冊
    resignPlugin() {
        let { playerService } = this;
        let { contentEl, model, useOffScreen } = this.playerService.config;

        this.mediaView = new MediaView();
        this.mediaView.init(playerService, { contentEl, model, useOffScreen });

        this.loadingView = new LoadingView();
        this.loadingView.init(playerService);

        let video = this.playerService.meidiaEl;
    }

    // 插件啓動
    pluginBoot(video: HTMLVideoElement) {
      let { contentEl } = this.playerService.config;
      this.mediaView.load(video);

      if (this.playerService.config.hasControl === true) {
        let control = new ControlPanel(video, contentEl);
         control.load();
      }
    }


    load(video: HTMLVideoElement) {
      this.pluginBoot(video);
    }
    set loading(value: boolean) {
       if (value === false) {
        debugger;
        this.loadingView.unload();
       } else {

       }
    }

    drawLoading() {
      // debugger;
      //  this.mediaView.drawLoading();
      if (this.loadingView.isLoading === true) {
        return false;
      }
      this.loadingView.load();
    }
    drawError() {
        this.mediaView.drawError();
    }
    setShowError(parm: boolean) {
        this.mediaView.showError = parm;
    }

    destroy() {
        this.mediaView.destroy();
        this.playerService.audioProcessingService.destroy();
        // if (this.playerService.config.showAudio === true) {
        //   // this.playerService.audioProcessingService.clearCanvas();
        //   this.playerService.audioProcessingService.destroy();
        // }
    }
    setCover(cover: boolean = false) {
      this.mediaView.setCover(cover);
     }

     drawRotate(degree: number) {
      this.mediaView.drawRotate(degree);
     }
     rotateReset() {
      this.mediaView.rotateReset();
     }
     drawTrasform(degree: number) {
      this.mediaView.drawTrasform(degree);
     }
     transformReset() {
      this.mediaView.transformReset();
     }
     drawVerticalMirror() {
      this.mediaView.drawVerticalMirror();
     }
     drawHorizontalMirror() {
      this.mediaView.drawHorizontalMirror();
     }
     captureShot() {
      let video_el = this.playerService.meidiaEl;

      let { imageUrl, height, width } = captureShot(video_el);

      return { imageUrl, height, width };
     }
     setDevicePoint(opt: {show: boolean;xPercent?: number;yPercent?: number}) {
          this.mediaView.setDeviceCenterPont(opt);
     }
     calculateCanvasPointToVideoFramePoint(opt: {canvasX: number; canvasY: number}) {
      let { canvasX, canvasY } = opt;
      let data = this.mediaView.calculateCanvasPointToVideoFramePoint({ canvasX, canvasY });
      return data;
     }
     setBrightness(brightness: number) {
      this.mediaView.setBrightness(brightness);
     }
     setContrast(contrast: number) {
      this.mediaView.setContrast(contrast);
     }
}


export default CanvasVideoService;