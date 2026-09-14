import { injectable, inject } from 'inversify';
import Emitter from '../../utils/emitter';
import YuvEnging from './render/yunEngine';
import type { IBridgePlayerConfig } from '../../types/services';
import MediaRenderEngine from './render';
import { TYPES } from '../../serviceFactories/symbol';
import StreamIo from './streamIo';
import AudioPlayer from './audio';
import Scheduler from '../player/util/scheduler';

import { MessageType } from './const';

// import RenderWorker from './worker/index-worker';

import RenderWorker from './worker/render/index-worker?worker&inline';
import StreamWorker from './worker/streamIo/index-worker?worker&inline';


 const defaultConfig={
    OffscreenCanvasConfig: {
        // 是否启用离屏渲染
        enableOffscreenRendering: true,
        // 使用的渲染方式: 'transferControl' 或 'newOffscreen'
        creationMethod: 'transferControl',
     }
 };

@injectable()
class StreamBridgePlayer extends Emitter {
    config: IBridgePlayerConfig
    yuvEngine: YuvEnging;
    mediaRenderEngine: MediaRenderEngine
    streamIo: StreamIo
    canvasVideoService: any
    audioProcessingService: AudioPlayer
    scheduler: Scheduler;
    error_connect_times: number;
    maxErrorTimes: number
    _worker: Worker
    _streamWorker: Worker
    enableWorker: boolean
    enableStreamWorker: boolean
    mediaInfo: {hasAudio: boolean;hasVideo: boolean};
    heart_check: boolean
    constructor(
        @inject(TYPES.IMediaRenderEngine) mediaRenderEngine: MediaRenderEngine,
        @inject(TYPES.IStreamIo) streamIo: StreamIo,
        @inject(TYPES.IAudioPlayer) audioProcessingService: AudioPlayer,
    ) {
        super();
        this.mediaRenderEngine=mediaRenderEngine;
        this.streamIo=streamIo;
        this.audioProcessingService=audioProcessingService;
    }
    init(config: IBridgePlayerConfig) {
        this.enableWorker=true;
        this.enableStreamWorker=true;
        this.scheduler = new Scheduler(1);
        this.maxErrorTimes=1000000;
        config=Object.assign({},defaultConfig,config);
        this.config=config;
        if(this.config.rtspUrl) {
            this.config.url=this.config.rtspUrl;
        }
        this.initWorker();

        this.initPlugin();

        let $this=this;
        // for hook
        this.canvasVideoService={
            setCover: (parm: boolean) => {
                this.setCover(parm);
            },
            drawRotate: (degree: number) => {
                this.drawRotate(degree);
            },
            rotateReset: () => {


            }

        };

        // this.mediaRenderEngine.init(this);
    }
    initRenderWorker() {
        if(this.enableWorker===true) {
            this._worker=new RenderWorker();


            this._worker.onmessage=(event: MessageEvent) => {
                let { type ,data } = event.data;
                if(type===MessageType.RENDER_Main_THREAD) {
                    // debugger;
                   this.mediaRenderEngine.mainThreadCanvasView.render(data);
                }
                if(type===MessageType.CLEAR_LOADING) {
                    this.mediaRenderEngine.clearLoading();
                }
                if(type===MessageType.ADD_RELOAD_TASK) {
                    this.addReloadTask({});
                }
            };


            // this._worker.postMessage({
            //     type: MessageType.INIT_CONFIG,
            //     data: { url: this.config.url }
            // });
        }
    }
    initStreamWorker() {
        if(this.enableStreamWorker===true) {
           this._streamWorker=new StreamWorker();

            this._streamWorker.postMessage({
                type: MessageType.INIT_CONFIG,
                data: { url: this.config.url }
            });

           this._streamWorker.onmessage=(event: MessageEvent) => {
            let { type ,data } = event.data;
            switch (type) {
                case MessageType.HEART_CHECK:
                    this.heart_check=data.heartCheck;
                    break;
                case MessageType.RENDER_FRAME:
                    this._worker.postMessage({ type: MessageType.RENDER_FRAME,
                        data: data },[data]);
                       break;
                case MessageType.CLEAR_LOADING:
                    this.mediaRenderEngine.clearLoading();
                    break;
                case MessageType.ADD_RELOAD_TASK:
                    this.addReloadTask({});
                    break;
                case MessageType.PERFORMACE_INFO:
                    this.emit('performaceInfo',data);
                    break;
                case MessageType.MEDIA_INFO:
                    this.emit('mediaInfo',data);
                    this.mediaInfo=data;
                    break;
                case MessageType.OHTER_INFO:
                    this.emit('otherInfo', data);
                    break;
                case MessageType.RECIVE_AUDIO_DATA:
                    this.audioPlay(data);
                     break;

                default:
                    break;
                // Add more cases here as needed
            }
           };
        }
    }

    audioPlay(data: ArrayBuffer) {
        if(this.audioProcessingService.hasCreatPlayer) {
            let audio_data=this.audioProcessingService.parseAudioData(data);
            let pcm_data=audio_data.pcmData;
            let floatdata=this.audioProcessingService.pcmPlayer.convertInt16ArrayToFloat32(pcm_data.buffer);
            this.audioProcessingService.feed(floatdata);
        }else{
            let audio_data=this.audioProcessingService.parseAudioData(data);
            this.audioProcessingService.createplayer(audio_data);
            let { hasAudio,hasVideo }=this.mediaInfo;
                if(hasAudio===true&&hasVideo===false) {
                    this.audioProcessingService.pcmPlayer.showAudio();
                    this.mediaRenderEngine.clearLoading();
                }
        }
    }

    initWorker() {
        this.initRenderWorker();
        this.initStreamWorker();
        // if(this.enableWorker===true) {
        //     this._worker=new processWorker();


        //     this._worker.onmessage=(event: MessageEvent) => {
        //         let { type ,data } = event.data;
        //         if(type===MessageType.RENDER_Main_THREAD) {
        //             // debugger;
        //            this.mediaRenderEngine.mainThreadCanvasView.render(data);
        //         }
        //         if(type===MessageType.CLEAR_LOADING) {
        //             this.mediaRenderEngine.clearLoading();
        //         }
        //         if(type===MessageType.ADD_RELOAD_TASK) {
        //             this.addReloadTask({});
        //         }
        //     };


        //     this._worker.postMessage({
        //         type: MessageType.INIT_CONFIG,
        //         data: { url: this.config.url }
        //     });
        // }
    }
    initPlugin() {
        // this.yuvEngine=new YuvEnging();
        // this.yuvEngine.init(this);
        if(this.enableStreamWorker!=true) {
            this.streamIo.init(this);
        }

        this.mediaRenderEngine.init(this);
        this.audioProcessingService.init(this);
    }
    createPlayer() {
        this.play();
    }
    fetchStream() {

    }

    start() {
        // this.yuvEngine.render();
    }

    // for hook
    createFlvPlayer() {
        this.play();
    }

    play() {
        this.mediaRenderEngine.drawLoading();

        // this.streamIo.open();
        if(this.enableStreamWorker===true) {
            this._streamWorker.postMessage({ type: MessageType.OPEN_SOCKET });
        }else{
            this.streamIo.open();
        }

        // if(this.enableWorker===true) {
        //     this._worker.postMessage({
        //         type: MessageType.OPEN_SOCKET
        //     });
        // }else{
        //     this.streamIo.open();
        // }
    }
    abort() {
        this.streamIo.abort();
    }

    destroy() {
        // this.streamIo.destroy();
        this.mediaRenderEngine.destroy();
        this.audioProcessingService.destroy();

        if(this.enableWorker===true) {
            this._worker.terminate();
        }
        if(this.enableStreamWorker===true) {
            this._streamWorker.postMessage({ type: MessageType.CLOSE_SOCKET });
            setTimeout(() => {
            this._streamWorker.terminate();
            }, 10);
        }else{
            this.streamIo.destroy();
        }
    }


    setCover(parm: boolean) {
        try{
            debugger;
             this?.mediaRenderEngine?.yuvEngine.setCover(parm);
        }catch(e) {

        }
    }
    drawRotate(degree?: number) {
        degree=Number(degree);
        try{
            this?.mediaRenderEngine?.yuvEngine.drawRotate(degree);
       }catch(e) {

       }
    }
    mute() {

    }
    checkPlaying() {
        if(this.enableStreamWorker===true) {
           return this.heart_check;
        }
        if(this.enableStreamWorker!=true) {
            let { heartCheck } = this.streamIo._ioLoader.streamSocketClient;
            if(heartCheck===true) {
                this.mediaRenderEngine.clearLoading();
            }
            return heartCheck;
        }
    }

    addReloadTask(parm?: {arr_msg?: Array<string>}) {
        if (this.error_connect_times > this.maxErrorTimes) {
          //  console.log("error_connect_times > 4: Scheduler clearQueu  "+this.config.url)
            // this.scheduler.clearQueue();
            return false;
        }

        let queue = this.scheduler.getQueue();
        if (queue.length > 10) {
           // console.log("task > 10 addTask false "+this.config.url)
            return false;
        }
        this.scheduler.addTask(() => {
            let { arr_msg = [''] } = parm;
            // this.canvasVideoService.drawLoading();
            this.mediaRenderEngine.drawLoading();
            console.log('=======tasking=======');
            console.log("reload");
           console.log('=======tasking=======');
            this.reload();
            return new Promise(resolve => setTimeout(() => {
                if (this.checkPlaying()) {
                    this.error_connect_times = 0;
                    resolve('clean');
                } else {
                    resolve('');
                }
                }, 8000)); // 已10s 的速度均衡执行reload 任务
             });
    }


    forceReload() {
        this.error_connect_times = 0;
        // this.canvasVideoService.clear = false;
        this.addReloadTask({ arr_msg: ['---设备上线 强制重连 ----'] });

        // setTimeout(() => {
        //     this.addReloadTask({ arr_msg: ['---设备上线 强制重连 ----'] });
        // }, 18000); // 手机app 有问题 要二次reload
    }

    getQueue() {
        let que=this.scheduler.getQueue();
        console.info(que);
    }
    reload() {
        // if(this.enableWorker===true) {
        //     this._worker.postMessage({ type: MessageType.RELOAD });
        // }else{
        //     this.streamIo._ioLoader.reload();
        // }

        if(this.enableStreamWorker) {
            this._streamWorker.postMessage({ type: MessageType.RELOAD });
            this._worker.postMessage({ type: MessageType.RELOAD_CANVAS });
        }else{
            this.streamIo._ioLoader.reload();
        }
     }
}

export default StreamBridgePlayer;
