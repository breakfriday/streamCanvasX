import { injectable } from 'inversify';
import mpegts from '@break_happy/streamcanvasx-core';
import type { ImainPlayerService } from '../types/services/index';
import Mpegts from '@break_happy/streamcanvasx-core';

@injectable()
class mainPlayerService {
    private video!: HTMLVideoElement;
    private canvas!: HTMLCanvasElement;
    private context!: CanvasRenderingContext2D;
    private mpegtsPlayer: Mpegts.Player;
    private root_el: HTMLElement;
    private aspectRatio: number;
    private metadata: any;

    private config: Parameters<ImainPlayerService['setConfig']>[0];

    constructor(parmams: Parameters<ImainPlayerService['factory']>[0]) {
      // this.video = parmams.vedio_el;
      this.video = document.createElement('video');
      this.video.controls = true;
      this.canvas = parmams.canvas_el;
      this.root_el = parmams.root_el;
      this.config = parmams.config || {};
      if (this.canvas) {
        this.context = this.canvas.getContext('2d')!;
      }


      this.root_el.innerHTML = '';

      this.root_el.appendChild(this.video);

      this.setVideoSize();
      this.vedioEvents();
    }
    get _vedio() {
      return this.video;
    }
    createFlvPlayer(parms: Parameters<ImainPlayerService['createFlvPlayer']>[0]) {
      let { type, isLive, url } = parms;
      let videoEl = this.video;

      if (videoEl) {
        this.mpegtsPlayer = mpegts.createPlayer({
          type: type!, // could also be mpegts, m2ts, flv
          isLive: isLive,
          url: url,
          hasAudio: true,
        });
        this.mpegtsPlayer.attachMediaElement(videoEl);
        this.getVideoSize();
        this.mpegtsPlayer.load();

        this.mpegtsPlayer.on(mpegts.Events.MEDIA_INFO, (parm) => {
          let video_width = parm.metadata.width;
          let video_height = parm.metadata.height;
          this.metadata = {
            video_height, video_width,
          };
          this.getVideoSize();
         });

        this.mpegtsPlayer.on(mpegts.Events.METADATA_ARRIVED, (parm) => {
          this.mpegtsPlayer.play();
        });

        this.mpegtsPlayer.on(mpegts.Events.ERROR, (error, detailError) => {
          if (error === mpegts.ErrorTypes.NETWORK_ERROR) {
            if (detailError === mpegts.ErrorDetails.NETWORK_UNRECOVERABLE_EARLY_EOF) {
              this.reoload();
            }
            if (detailError === mpegts.ErrorDetails.NETWORK_TIMEOUT) {
              return false;
            }
          }
        });
      }
    }

    setConfig(params: Parameters<ImainPlayerService['setConfig']>[0]) {
      this.config = Object.assign({}, this.config, params);
    }

    load() {
      this.mpegtsPlayer.load();
    }
    play() {
      this.mpegtsPlayer.play();
    }
    paused() {
      this.mpegtsPlayer.pause();
    }

    reoload() {
       this.mpegtsPlayer.unload();
       this.mpegtsPlayer.detachMediaElement();
       this.mpegtsPlayer.attachMediaElement(this.video);
      this.mpegtsPlayer.load();
      this.mpegtsPlayer.play();
    }

    set_blob_url(filedata: File) {
      let blobUrl = URL.createObjectURL(filedata);
      this.video.src = blobUrl;
      this.video.load();
    }

    vedioEvents() {
      this.loadMediaEvent();

      this.video.addEventListener(
        'play',
        () => {
          this.analyzeCanvas.call(this);
          // requestAnimationFrame(this.analyzeCanvas.bind(this));
        },
        false,
      );
    }

    getVideoSize() {
      let { videoHeight = 0, videoWidth = 0 } = {};
      if (this.metadata) {
        videoWidth = this.metadata.video_width;
        videoHeight = this.metadata.video_height;
      } else {
        videoHeight = this.video.videoHeight;
        videoWidth = this.video.videoWidth;
      }


      // 计算最大公约数 （数学上求最大公约数的方法是“辗转相除法”，就是用一个数除以另一个数（不需要知道大小），取余数，再用被除数除以余数再取余，再用新的被除数除以新的余数再取余，直到余数为0，最后的被除数就是最大公约数）
        function gcd(a, b) {
            return b === 0 ? a : gcd(b, a % b);
        }

        let greatestCommonDivisor = gcd(videoWidth, videoHeight);

        // 计算宽高比
        let aspectRatioWidth = videoWidth / greatestCommonDivisor;
        let aspectRatioHeight = videoHeight / greatestCommonDivisor;

        let ratio = `${aspectRatioWidth}:${aspectRatioHeight}`;

         this.aspectRatio = aspectRatioWidth / aspectRatioHeight;

         console.log('------------------------');
         console.log(ratio);
         console.log('------------------------');
    }

    loadMediaEvent() {
      const video_el = this.video;
      if (video_el) {
        video_el.addEventListener('loadedmetadata', () => {
          this.getVideoSize();
        // let { videoHeight, videoWidth } = video_el;


        // // 计算最大公约数 （数学上求最大公约数的方法是“辗转相除法”，就是用一个数除以另一个数（不需要知道大小），取余数，再用被除数除以余数再取余，再用新的被除数除以新的余数再取余，直到余数为0，最后的被除数就是最大公约数）
        //   function gcd(a, b) {
        //       return b === 0 ? a : gcd(b, a % b);
        //   }

        //   let greatestCommonDivisor = gcd(videoWidth, videoHeight);

        //   // 计算宽高比
        //   let aspectRatioWidth = videoWidth / greatestCommonDivisor;
        //   let aspectRatioHeight = videoHeight / greatestCommonDivisor;

        //   let ratio = `${aspectRatioWidth}:${aspectRatioHeight}`;

        //    this.aspectRatio = aspectRatioWidth / aspectRatioHeight;


        //   console.log('------------------------');
        //   console.log(ratio);
        //   console.log('------------------------');
        });
      }
    }

    setVideoSize() {
      let height = this.root_el.clientHeight;
      let width = this.root_el.clientWidth;

      this.video.height = height;
      this.video.width = width;
    }

    async renderByWebGpu() {
      const adapter = await navigator.gpu.requestAdapter();
      const device = await adapter.requestDevice();

      // 创建一个GPU纹理来保存视频帧
      const videoTexture = device.createTexture({
        size: {
          width: this.video.videoWidth,
          height: this.video.videoHeight,
          depth: 1,
        },
        format: 'rgba8unorm',
        usage: window.GPUTextureUsage.COPY_DST | window.GPUTextureUsage.RENDER_ATTACHMENT,
      });


      const renderFrame = () => {
        // 将视频帧复制到纹理
        device.queue.copyExternalImageToTexture(
          { source: this.video },
          { texture: videoTexture },
          [this.video.videoWidth, this.video.videoHeight, 1],
        );

        // TODO: 在这里使用纹理进行渲染

        // 在下一帧继续
        requestAnimationFrame(renderFrame.bind(this));
      };


      renderFrame.call(this);
    }

    analyzeCanvas() {
      let { width } = this.canvas;
      let height = this.canvas.height / this.aspectRatio;
      let loopRender = () => {
        if (this.video.ended || this.video.paused) {
          return;
        }
        this.context.drawImage(
          this.video,
          0,
          0,
          width,
         height,
        );

        requestAnimationFrame(loopRender.bind(this));
      };


      // 背景色域渐变
      const {
        data: [r, g, b],
      } = this.context.getImageData(0, 0, 1, 1);

      // document.body.style.cssText = `background: rgb(${r}, ${g}, ${b});`;
     loopRender();
    }
  }


  export default mainPlayerService;
