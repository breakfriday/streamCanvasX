import PlayerService from '../../index';
import { MessageType } from '../../const';
import { data } from 'codec-parser';


class MainThreadCanvasView {
    playerService: PlayerService;
    isLoading: boolean
    canvas_el: HTMLCanvasElement;
    canvas_context: CanvasRenderingContext2D;
    zIndex: string;
    cover: boolean;
    rotateDegreeSum: number;
    resizeObserver: ResizeObserver;
    constructor() {

    }
    init(playerService: PlayerService) {
        this.playerService=playerService;
        this.zIndex='7';
        this.event();
    }
    set loading(value: any) {
        this.isLoading= value;
      }
    load() {
       let creationMethod=this.playerService.config?.OffscreenCanvasConfig?.creationMethod;

        this.isLoading=true;
        let { contentEl } = this.playerService.config;
        let canvas_el=document.createElement("canvas");
        this.canvas_el=canvas_el;
        this.canvas_el.setAttribute('name', 'mainThreadCanvas');
        if(creationMethod!="transferControl") {
          this.canvas_context=canvas_el.getContext("2d");
        }
        this.isLoading=true;
        this.setCanvasAttributes();
        contentEl.append(canvas_el);
        this.initOffScreen();
    }

    event() {
      let { contentEl } = this.playerService.config;
      // 监听 dom size 变化， 调整canvas 大小
      this.resizeObserver = new ResizeObserver(() => {
        setTimeout(() => {
          let width=contentEl.clientWidth;
          let height=contentEl.clientHeight;
          this.playerService._worker.postMessage({ type: MessageType.RESIZE,data: { width,height } });
        //  this.resizeControlPannel();
          }, 20);
      });

      this.resizeObserver.observe(contentEl);
    }

    setCanvasAttributes() {
        let { zIndex } = this;
        let { contentEl } = this.playerService.config;
        let width=contentEl.clientWidth;
        let height=contentEl.clientHeight;
        this.canvas_el.width=width;
        this.canvas_el.height=height;
        this.canvas_el.style.position="absolute";
        this.canvas_el.style.zIndex=zIndex;
        this.canvas_el.style.top="0px";
        this.canvas_el.style.left="0px";
    }

    calculateVideoAttributes(videoFrame: ImageBitmap): {
      offsetX: number;
      offsetY: number;
      targetVideoWidth: number;
      targetVideoHeight: number;
     } {
     let video = videoFrame;
     let video_height = video.height;
     let video_width = video.width;
     let { width ,height } = this.canvas_el;


     const centerX = width / 2;
     const centerY = height / 2;

     let offsetX=0;
     let offsetY=0;
     let targetVideoWidth=width;
     let targetVideoHeight=height;

     if(this.cover===true) {
         if (this.cover === true && (this.rotateDegreeSum === 90 || this.rotateDegreeSum === 270)) {
             offsetX=centerX - centerY;
             offsetY= centerY - centerX;
             targetVideoWidth=height;
             targetVideoHeight=width;
         }
     }else{
           let scaleRatio = Math.min(width / video_width, height / video_height);
           // Calculate the target video dimensions after scaling
            targetVideoWidth = video_width * scaleRatio;
            targetVideoHeight = video_height * scaleRatio;

           // Calculate the position to center the video frame on the canvas
          offsetX = (width - targetVideoWidth) / 2;
          offsetY = (height - targetVideoHeight) / 2;
     }

     return { targetVideoWidth,targetVideoHeight,offsetX,offsetY };
   }

     render(bitmap: ImageBitmap) {
      this.renderBitmap(bitmap);
      // this.renderBitmap(bitmap);
      // let { offsetX,offsetY,targetVideoHeight ,targetVideoWidth }=this.calculateVideoAttributes(bitmap);

      //  this.canvas_context.drawImage(bitmap, offsetX, offsetY,targetVideoWidth,targetVideoHeight);
    }

    renderBitmap(bitmap: ImageBitmap) {
      // let { offsetX,offsetY,targetVideoHeight ,targetVideoWidth }=this.calculateVideoAttributes(bitmap);
      // this.canvas_context.drawImage(bitmap, offsetX, offsetY,targetVideoWidth,targetVideoHeight);
      this.canvas_context.drawImage(bitmap, 0, 0);
     }

     renderBlob(blob: Blob) {
        createImageBitmap(blob).then(bitmap => {
            let { offsetX,offsetY,targetVideoHeight ,targetVideoWidth }=this.calculateVideoAttributes(bitmap);
            this.canvas_context.drawImage(bitmap, offsetX, offsetY,targetVideoWidth,targetVideoHeight);
        });
     }
    unload() {
      if(this.canvas_el) {
        this.canvas_el.remove();
        this.canvas_context=null;
        this.canvas_el=null;
      }
    }
    destroy() {
        this.unload();
    }

    initOffScreen() {
      let { config } = this.playerService;
      if(config.OffscreenCanvasConfig.creationMethod==="transferControl") {
        const offscreen = this.canvas_el.transferControlToOffscreen();
        this.playerService._worker.postMessage({
          type: MessageType.INIT_CANVAS_TRANSFERCONTROL,
          data: offscreen
        },[offscreen]);
      }else{
        let { width ,height } = this.playerService.mediaRenderEngine.mainThreadCanvasView.canvas_el;
        this.playerService._worker.postMessage({
            type: MessageType.INIT_WORKER_CANVAS,
            data: {
                width,height
            }
          });
      }
    }
}

export default MainThreadCanvasView;