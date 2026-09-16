import { injectable, inject, Container, LazyServiceIdentifer } from 'inversify';
import PlayerService from '../../player';
import { UseMode } from '../../../constant';
import { RotateDecorator, RotateResetDecrator, TrasformDecractor, TrasforResetmDecractor, VerticalMirrorDecrator, HorizontalMirrorDecrator, setBrightness, setContrast } from './utilDecorator/RotateTrasformDecorator';


class MediaView {
    canvas_el: HTMLCanvasElement;
    canvas_el2: HTMLCanvasElement; // canvas2 用来最原始视频录制的画布
    canvas_context: CanvasRenderingContext2D;
    canvas_context2: CanvasRenderingContext2D;
    contentEl: HTMLElement;

    useMode: UseMode;

    playerService: PlayerService;
    resizeObserver: ResizeObserver;

    videoFrame: VideoFrame;

    clear: boolean;
    loading: boolean;
    cover: boolean;

    transformCount: number;
    transformDegreeSum: number;
    rotateDegreeSum: number;

    brightness: number; // 亮度
    contrast: number; // 对比度


    isDrawingWatermark: boolean;
    isGettingWatermark: boolean;
    frameCallbackId: number;

    video: HTMLVideoElement;
    startTime: number;
    timer: NodeJS.Timeout;
    lastCount: number;
    nowFrameCount: number;
    showError?: boolean;
    deviceCenterPont?: {
      xPercent?: number;
      yPercent?: number;
      show?: boolean;
    };
    _videoInfo?: {
      videoWidth?: number;
      videoHeight?: number;

    };
    constructor() {
        this.canvas_el = document.createElement('canvas');

        // canvas_el2 用于录制原始高清视频
        this.canvas_el2 = document.createElement('canvas');

        this.canvas_el.style.position = 'absolute';
        this.canvas_el.style.zIndex = '5';
        this.deviceCenterPont = {};
        this._videoInfo = {};
    }
    init(playerService: PlayerService, data: {model?: UseMode; contentEl?: HTMLElement | null; useOffScreen: boolean}) {
        // this.initGpu();
        //  this.setUseMode(UseMode.UseCanvas);
        //  this.setUseMode(UseMode.UseWebGPU);
        this.playerService = playerService;
        let { model = UseMode.UseCanvas, contentEl } = playerService.config || {};


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

    setDeviceCenterPont(opt: {show: boolean;xPercent?: number;yPercent?: number}) {
       let deviceCenterPont = Object.assign(this.deviceCenterPont, opt);
       this.deviceCenterPont = deviceCenterPont;
    }

    load(video: HTMLVideoElement) {
      this.video = video;
      this.startTime = performance.now();


      video.addEventListener('loadeddata', () => {
        console.log('MediaView', 'loadeddata');
        this.startHearChceck();
        this.startVideoFrameCallBack();
      });

      video.addEventListener('error', () => {
        this.cancelVideoFrameCallBack();
      });


      video.addEventListener('loadstart', () => {
        this.cancelVideoFrameCallBack();
      });

      // this.createVideoFramCallBack(video);
      }

      startVideoFrameCallBack() {
        this.cancelVideoFrameCallBack();
        if (!this.playerService.hasVideoTrack) return;

        let frameCount = 0;
        let lastFrameTime = performance.now();
        let fps = 0;
        const fpsCount = 5;
        let $this = this;
        // let startTime = performance.now();
        this.nowFrameCount = 0;
        this.lastCount = 0;

        const updatePerformanceInfo = (now) => {
          if (frameCount >= fpsCount) {
              let elapsed = (now - lastFrameTime) / 1000;
              fps = (fpsCount / elapsed).toFixed(1);

              frameCount = 0;
              lastFrameTime = now;
          }


          let performanceInfo = { fps: fps, duringtime: $this.millisecondsToTime(now - this.startTime) };
          $this.playerService.emit('performaceInfo', performanceInfo);
      };

        const frameCallback = (now) => {
          if (!this.playerService.hasVideoTrack) return;
          frameCount++;
          if (this.playerService.error_connect_times > this.playerService.maxErrorTimes) {
            return false;
          }
          // this.showError=true;
          this.render(this.video);
          this.nowFrameCount++;
          try {
            updatePerformanceInfo(now);
          } catch (e) {
          }
          this.frameCallbackId = this.video.requestVideoFrameCallback(frameCallback);
        };

        this.frameCallbackId = this.video.requestVideoFrameCallback(frameCallback);
      }

      cancelVideoFrameCallBack() {
        if (this.frameCallbackId) {
          this.video.cancelVideoFrameCallback(this.frameCallbackId);
        }
      }
    event() {
              // 监听 dom size 变化， 调整canvas 大小
      this.resizeObserver = new ResizeObserver(() => {
        setTimeout(() => {
           this.setCanvasSize();
           if (this.showError === true) {
            this.drawError();
           }
          //  this.resizeControlPannel();
        }, 20);
      });

      let { canvas_el } = this;
    //   canvas_el.addEventListener('mousemove', (event) => {
    //     if(this.deviceCenterPont&&this.deviceCenterPont.show===true&&this.deviceCenterPont.xPercent){
    //       const rect = canvas_el.getBoundingClientRect();
    //       const canvasX = event.clientX - rect.left;
    //       const canvasY = event.clientY - rect.top;


    //       let pointPercent=this.calculateCanvasPointToVideoFramePoint({canvasX,canvasY})

    //       if(pointPercent&&pointPercent.percentX){
    //         let relative_x= pointPercent.percentX-this.deviceCenterPont.xPercent
    //         let relative_y= pointPercent.percentY-this.deviceCenterPont.yPercent

    //         console.log(JSON.stringify({relative_x,relative_y}))

    //       }else{

    //       }
    //     }


    // });

    canvas_el.addEventListener('click', (event) => {
      if (this.deviceCenterPont && this.deviceCenterPont.show === true && this.deviceCenterPont.xPercent) {
        const rect = canvas_el.getBoundingClientRect();
        const canvasX = event.clientX - rect.left;
        const canvasY = event.clientY - rect.top;


        let pointPercent = this.calculateCanvasPointToVideoFramePoint({ canvasX, canvasY });

        if (pointPercent && pointPercent.percentX) {
          let relative_x = pointPercent.percentX - this.deviceCenterPont.xPercent;
          let relative_y = pointPercent.percentY - this.deviceCenterPont.yPercent;


          this.playerService.emit('select_point', { relative_x, relative_y });

          console.log(JSON.stringify({ relative_x, relative_y }));
        } else {

        }
      }
  });


      this.resizeObserver.observe(this.contentEl);
    }
    drawPercenta() {

    }
    initgl() {

    }
    initGpu() {

    }
    _initContext2D() {
        if (this.playerService.config.useOffScreen === true) {

        } else {
          this.canvas_context = this.canvas_el.getContext('2d');
        }
      }
    setUseMode(mode: UseMode): void {
        this.useMode = mode;
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
          // if(this.showError===true) {
          //   // this.drawError();
          // }

          this.renderCanvas2d(this.video);
    }
    // createVideoFramCallBack(video: HTMLVideoElement) {
    //     let $this = this;

    //     let fpsCount = 5;
    //     let frame_count = 0;
    //     let start_time = 0.0;
    //     let now_time = 0.0;
    //     let fps = 0;

    //     function millisecondsToTime(ms: any) {
    //       // 将时间戳转换为秒并取整
    //       let seconds = Math.floor(ms / 1000);

    //       // 计算小时数、分钟数和秒数
    //       let hours = Math.floor(seconds / 3600);
    //       let minutes = Math.floor((seconds - (hours * 3600)) / 60);
    //        seconds = seconds - (hours * 3600) - (minutes * 60);

    //       // 如果只有一位数字，前面补0
    //       if (hours < 10) { hours = `0${hours}`; }
    //       if (minutes < 10) { minutes = `0${minutes}`; }
    //       if (seconds < 10) { seconds = `0${seconds}`; }

    //       // 返回格式化的字符串
    //       return `${hours}:${minutes}:${seconds}`;
    //     }
    //     let cb = () => {
    //       video.requestVideoFrameCallback((now) => {
    //           // $this.renderFrameByWebgpu(video);
    //           let last_time = now_time;
    //           if (start_time == 0.0) {
    //             start_time = now;
    //           }
    //           now_time = now;
    //           // let last_time = performance.now();

    //           let elapsed = (now_time - last_time) / 1000.0;
    //           // 每经过fpsCount帧后，输出一次当前的瞬时帧率
    //           if (!(frame_count % fpsCount)) {
    //             fps = (1 / elapsed).toFixed(3);
    //           }
    //           frame_count++;

    //           let performanceInfo = { fps: fps, duringtime: millisecondsToTime(now - start_time) };
    //           // console.info(performanceInfo);

    //           $this.playerService.emit('performaceInfo', performanceInfo);
    //           $this.render(video);
    //         cb();
    //       });
    //     };
    //     cb();
    //   }

    createVideoFramCallBack(video: HTMLVideoElement) {
      let frameCount = 0;
      let lastFrameTime = performance.now();
      let fps = 0;
      const fpsCount = 5;
      let $this = this;
      let startTime = performance.now();

      const updatePerformanceInfo = (now) => {
          if (frameCount >= fpsCount) {
              let elapsed = (now - lastFrameTime) / 1000;
              fps = (fpsCount / elapsed).toFixed(1);

              frameCount = 0;
              lastFrameTime = now;
          }


          let performanceInfo = { fps: fps, duringtime: $this.millisecondsToTime(now - startTime) };
          $this.playerService.emit('performaceInfo', performanceInfo);
          // $this.playerService.emit('performanceInfo', {
          //     fps: fps,
          //     duringTime: $this.millisecondsToTime(now - lastFrameTime)
          // });
      };

      const frameCallback = (now) => {
          frameCount++;
          updatePerformanceInfo(now);
          this.showError = false;
          this.render(video);
          video.requestVideoFrameCallback(frameCallback);
      };

      video.requestVideoFrameCallback(frameCallback);
  }
  millisecondsToTime(ms) {
    let seconds = Math.floor(ms / 1000);
    let hours = Math.floor(seconds / 3600);
    seconds -= hours * 3600;
    let minutes = Math.floor(seconds / 60);
    seconds -= minutes * 60;

    return [hours, minutes, seconds].map(v => v.toString().padStart(2, '0')).join(':');
}

    render(videoFrame: VideoFrame | HTMLVideoElement) {
        this.videoFrame = videoFrame as VideoFrame;
          switch (this.useMode) {
              case UseMode.UseCanvas:
                  this.renderCanvas2d(videoFrame);
                  break;
              case UseMode.UseWebGL:
                //   this.renderGl(videoFrame);
                  break;
              case UseMode.UseWebGPU:
                //   this.renderFrameByWebgpu(videoFrame);
              break;
          }
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
      destroy() {
        // if (this.playerService.config.showAudio === true) {
        //   this.playerService.audioProcessingService.clearCanvas();
        // }
        if (this.canvas_el && this.contentEl) {
          this.canvas_el.remove();
          this.contentEl = null;
          this.stopHeartChceck();
        }
      }

      drawError() {
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

       if (this.playerService.error_message) {
        let message = this.playerService.error_message;
        canvasContext.font = '13px Arial';
        canvasContext.fillStyle = 'gray';
        canvasContext.textAlign = 'center';
        canvasContext.fillText(message, canvas.width / 2, canvas.height * 0.85);
       }
       this.showError = true;
      }
    //   renderCanvas2d(videoFrame: VideoFrame | HTMLVideoElement) {
    //     let video = videoFrame as HTMLVideoElement;
    //     let { videoHeight, videoWidth } = video;
    //     this._videoInfo = { videoHeight, videoWidth };

    //     let width = 400;
    //     let height = 200;

    //     if (this.contentEl) {
    //       width = this.contentEl.clientWidth;
    //       height = this.contentEl.clientHeight;
    //     }
    //     const centerX = width / 2;
    //     const centerY = height / 2;

    //     this.canvas_context.clearRect(0, centerY - centerX, width, width); // 当 width > height 时，有效


    //     let { offsetX, offsetY, targetVideoHeight, targetVideoWidth } = this.calculateVideoAttributes(video);
    //     this.canvas_context.drawImage(videoFrame, offsetX, offsetY, targetVideoWidth, targetVideoHeight);
    //     this.drawCenterPoint(video);
    // }

    renderCanvas2d(videoFrame: VideoFrame | HTMLVideoElement) {
      let video = videoFrame as HTMLVideoElement;
      if (video) {
        let { videoHeight, videoWidth } = video;
        this._videoInfo = { videoHeight, videoWidth };

        let width = 400;
        let height = 200;

        if (this.contentEl) {
          width = this.contentEl.clientWidth;
          height = this.contentEl.clientHeight;
        }

        const centerX = width / 2;
        const centerY = height / 2;
        if (this.canvas_context) {
          this.canvas_context.clearRect(0, centerY - centerX, width, width); //
          let { offsetX, offsetY, targetVideoHeight, targetVideoWidth } = this.calculateVideoAttributes(video);
          this.canvas_context.drawImage(videoFrame, offsetX, offsetY, targetVideoWidth, targetVideoHeight);
          // 当 width > height 时，有效
          this.drawCenterPoint(video);

          // 亮度 对比度设置
          if (this.brightness || this.contrast) this.setBrightnessContrast();
          }
      }
    }

    // 亮度对比度设置
    setBrightnessContrast() {
      // console.log('renderCanvas2d 调用', this.brightness);
      // TODO 调节亮度 对比度
      const imageData = this.canvas_context.getImageData(0, 0, this.canvas_el.width, this.canvas_el.height);
      const { data } = imageData;
      for (let i = 0; i < data.length; i += 4) {
        // 对比度设置
        if (this.contrast) {
          data[i] = this.adjustContrast(data[i], this.contrast || 0);
          data[i + 1] = this.adjustContrast(data[i + 1], this.contrast || 0);
          data[i + 2] = this.adjustContrast(data[i + 2], this.contrast || 0);
        }


        // 亮度设置
        if (this.brightness) {
          data[i] = this.adjustBrightness(data[i], this.brightness || 0);
          data[i + 1] = this.adjustBrightness(data[i + 1], this.brightness || 0);
          data[i + 2] = this.adjustBrightness(data[i + 2], this.brightness || 0);
        }
      }
      this.canvas_context.putImageData(imageData, 0, 0);
    }

    // 亮度调整函数
    adjustBrightness(value: number, factor: number): number {
        // 亮度范围-100到100，直接加减并限制在[0,255]
        return Math.max(0, Math.min(255, value + factor));
    }

    // 对比度调整函数
    adjustContrast(value: number, factor: number): number {
        const contrastFactor = (259 * (factor + 255)) / (255 * (259 - factor));
        const adjusted = contrastFactor * (value - 128) + 128;
        // return Math.max(0, Math.min(255, adjusted));
        return adjusted;
    }


     calculateVideoAttributes(videoFrame: VideoFrame | HTMLVideoElement): {
         offsetX: number;
         offsetY: number;
         targetVideoWidth: number;
         targetVideoHeight: number;
        } {
        let video = videoFrame as HTMLVideoElement;
        let video_height = video.videoHeight;
        let video_width = video.videoWidth;
        let width = 400;
        let height = 200;
        if (this.contentEl) {
            width = this.contentEl.clientWidth;
            height = this.contentEl.clientHeight;
          }

        const centerX = width / 2;
        const centerY = height / 2;

        let offsetX = 0;
        let offsetY = 0;
        let targetVideoWidth = width;
        let targetVideoHeight = height;

        if (this.cover === true) {
            if (this.cover === true && (this.rotateDegreeSum === 90 || this.rotateDegreeSum === 270)) {
                offsetX = centerX - centerY;
                offsetY = centerY - centerX;
                targetVideoWidth = height;
                targetVideoHeight = width;
            }
        } else {
              let scaleRatio = Math.min(width / video_width, height / video_height);
              // Calculate the target video dimensions after scaling
               targetVideoWidth = video_width * scaleRatio;
               targetVideoHeight = video_height * scaleRatio;

              // Calculate the position to center the video frame on the canvas
             offsetX = (width - targetVideoWidth) / 2;
             offsetY = (height - targetVideoHeight) / 2;
        }
        return { targetVideoWidth, targetVideoHeight, offsetX, offsetY };
      }
      calculatePointOnCanvas(videoFrame: HTMLVideoElement, xPercent: number, yPercent: number) {
          // Calculate the attributes of the video on canvas
          let { offsetX, offsetY, targetVideoWidth, targetVideoHeight } = this.calculateVideoAttributes(videoFrame);

          // Convert the percentage to the original video dimensions
          const video_width = videoFrame.videoWidth;
          const video_height = videoFrame.videoHeight;

          const pixelX = (xPercent / 100) * video_width;
          const pixelY = (yPercent / 100) * video_height;

          // Calculate the position of the point on the canvas
          const canvasX = offsetX + (pixelX * (targetVideoWidth / video_width));
          const canvasY = offsetY + (pixelY * (targetVideoHeight / video_height));


          return { x: canvasX, y: canvasY };
      }

      calculateCanvasPointToVideoFramePoint(opt: {canvasX: number; canvasY: number}) {
           let video_info = this._videoInfo;
           // 获取视频的原始宽度和高度
            let video_width = video_info.videoWidth;
            let video_height = video_info.videoHeight;

            let { canvasX, canvasY } = opt;

            // 假设我们有一个目标宽度和高度
            let width = 400;
            let height = 200;
            if (this.contentEl) {
                width = this.contentEl.clientWidth;
                height = this.contentEl.clientHeight;
            }

            // 计算视频缩放比例
            let scaleRatio = Math.min(width / video_width, height / video_height);

            // 计算缩放后的视频宽高
            let targetVideoWidth = video_width * scaleRatio;
            let targetVideoHeight = video_height * scaleRatio;

            // 计算偏移量
            let offsetX = (width - targetVideoWidth) / 2;
            let offsetY = (height - targetVideoHeight) / 2;

            // 去除偏移量以获取相对视频内容的坐标
            let relativeX = canvasX - offsetX;
            let relativeY = canvasY - offsetY;

            // 检查点是否在视频内容范围内
            if (relativeX < 0 || relativeX > targetVideoWidth || relativeY < 0 || relativeY > targetVideoHeight) {
                console.info("给定点不在视频内容范围内'");
                return false;
            }

            // 反向计算得到在原始视频中的位置
            let originalX = relativeX / scaleRatio;
            let originalY = relativeY / scaleRatio;

            // 计算基于视频帧的百分比位置
            let percentX = (originalX / video_width) * 100;
            let percentY = (originalY / video_height) * 100;

            return { percentX, percentY };
      }

      drawCenterPoint(videoFrame: HTMLVideoElement) {
        if (this.deviceCenterPont?.show === true) {
          let { xPercent, yPercent } = this.deviceCenterPont;
          let { x, y } = this.calculatePointOnCanvas(videoFrame, xPercent, yPercent);

          this.canvas_context.beginPath();
          this.canvas_context.arc(x, y, 5, 0, 2 * Math.PI); // Draw a circle to mark the point
          this.canvas_context.fillStyle = 'green'; // Set the color of the point
          this.canvas_context.fill();


          this.drawCoordinateLines(x, y);
        }
      }
      drawCoordinateLines(canvasX: number, canvasY: number) {
        let canvasContext = this.canvas_context;
        // Set style for the coordinate lines
        this.canvas_context.strokeStyle = 'green';
        this.canvas_context.lineWidth = 1;
        this.canvas_context.setLineDash([]);


        this.canvas_context.beginPath();
        this.canvas_context.moveTo(0, canvasY);
        this.canvas_context.lineTo(canvasContext.canvas.width, canvasY);
        this.canvas_context.stroke();


        canvasContext.beginPath();
        canvasContext.moveTo(canvasX, 0);
        canvasContext.lineTo(canvasX, canvasContext.canvas.height);
        canvasContext.stroke();
    }

      setCover(cover: boolean = false) {
        this.cover = cover;
       }

       @RotateDecorator
       drawRotate(degree: number) {}

       @RotateResetDecrator
       rotateReset() { }

       @TrasformDecractor
       drawTrasform(degree: number) {}

       @TrasforResetmDecractor
       transformReset() {}

       @VerticalMirrorDecrator
       drawVerticalMirror() {
        // 垂直镜像变化
      }
      @HorizontalMirrorDecrator
      drawHorizontalMirror() {
      // 水平镜像变化
      }

      @setBrightness
      setBrightness(brightness: number) {
        // 亮度变化
      }

      @setContrast
      setContrast(contrast: number) {
        // 对比度变化
      }

    setCanvas2Size(parm: {width: number; height: number}) {
     let { width, height } = parm;
       this.canvas_el2.width = width;
       this.canvas_el2.height = height;
     }

    startHearChceck() {
      if (!this.playerService.hasVideoTrack) {
        this.stopHeartChceck();
        return;
      }
      if (!this.timer) {
        this.timer = setInterval(() => {
           if (!this.playerService.hasVideoTrack) {
             this.stopHeartChceck();
             return;
           }
           if (this.lastCount >= this.nowFrameCount) {
            this.playerService.addReloadTask({ arr_msg: ['---fps 調用鏈檢查異常 ----'] });
           } else {
            // console.log(this.lastCount)
            // console.log(this.nowFrameCount)
            // debugger
            this.lastCount = this.nowFrameCount;
           }
          }, 10000); // 每10秒检查一次
      }
    }

     stopHeartChceck() {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
       }
     }
}

export default MediaView;
