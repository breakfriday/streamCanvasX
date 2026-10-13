import { injectable, inject, Container, LazyServiceIdentifer } from 'inversify';
import Emitter from '../../utils/emitter';

import { TYPES } from '../../serviceFactories/symbol';
import HttpFlvStreamService from '../stream/fetch_stream_loader';
import FlvDemuxService from '../demux/flvDemux';
import { DEFAULT_PLAYER_OPTIONS } from '../../constant';
import WebcodecsDecoderService from '../decoder/webcodecs';
import CanvasVideoService from '../video/canvasVideoService';
import DebugLogService from '../DebugLogService';
import FLVDemuxStream from '../demux/flvDemuxStream';
import { UseMode } from '../../constant';
import corePlayer from '@break_happy/streamcanvasx-core';
// import Mpegts from '@break_happy/streamcanvasx-core';
import type { IplayerConfig } from '../../types/services';
import AudioProcessingService from '../audio/audioContextService';
import WasmDecoderService from '../decoder/wasmDecoder';
import CanvasToVideoSerivce from '../muxer/canvasToVideo';
import MseDecoderService from '../decoder/mediaSource';
import PreProcessing from '../preprocessing';
import Scheduler from './util/scheduler';
import RenderEngine from '../renderingEngines/baseEngine';

import { CorrectDecorator } from './util/decrator/configDecrator';


// 接入rtc player service
import RTCPlayerService from '../webrtc';

import LogMonitor from '../../LogMonitor';
// import { timeStamp } from 'console';
// import AudioPlayer from './audioPlayer2';

import AudioPlayer from './audioWorkLetPlayer';


// mport audiworkketplayer from "./audioWorkLetPlayer";

corePlayer.LoggingControl.applyConfig({
    forceGlobalTag: true,
    globalTag: 'streanCanvasX',
    enableDebug: true,
    enableAll: true,
    enableInfo: true,
    enableVerbose: false,
    enableError: true,
    enableWarn: false,

});


function now() {
    return new Date().getTime();
}

type Stats = {
    ts?: number;
    buf?: number;
    fps: number;
    abps: number;
    vbps: number;
};

@injectable()
class PlayerService extends Emitter {
    httpFlvStreamService: HttpFlvStreamService;
    flvVDemuxService: FlvDemuxService;
    webcodecsDecoderService: WebcodecsDecoderService;
    canvasVideoService: CanvasVideoService;
    debugLogService: DebugLogService;
    fLVDemuxStream: FLVDemuxStream;
    corePlayer: corePlayer.Player;
    audioProcessingService: AudioProcessingService;
    mseDecoderService: MseDecoderService;
    preProcessing: PreProcessing;
    renderEngine: RenderEngine;
    private _stats: Stats;
    private _startBpsTime?: number;
    _opt: any;
    _times: any;
    reload: any;
    config: IplayerConfig;
    error_connect_times: number;
    wasmDecoderService: WasmDecoderService;
    player2: any;
    canvasToVideoSerivce: CanvasToVideoSerivce;
    mediaInfo: {
        hasVideo?: boolean;
        hasAudio?: boolean;
        audioChannelCount?: number;
        audioCodec?: string;
        audioSampleRate?: number;
        videoCodec?: string;
        mimeType?: string;

    };
    meidiaEl: HTMLVideoElement;
    audioEl: HTMLVideoElement;
    scheduler: Scheduler;
    rtcPlayerService: RTCPlayerService;
    logMonitor: LogMonitor;
    maxErrorTimes: 100000;
    speed?: number;
    lowSpeedStartTime: number | null = null;
    lowSpeedTimer: NodeJS.Timeout;
    error_message?: string;
    _audioPlayer: AudioPlayer;
    audioPlaybackMode: 'audio-element' | 'audioContext' = 'audio-element';
    private audioCheckTimer?: ReturnType<typeof setTimeout>;
    private audioCheckElement?: HTMLVideoElement;
    private audioErrorHandler?: EventListener;
    private lastPCMSubmittedAt?: number;
    wasmModel: boolean;

    get hasVideoTrack(): boolean {
        return this.mediaInfo?.hasVideo ?? (this.config.hasVideo !== false);
    }
    constructor(

        @inject(TYPES.IHttpFlvStreamLoader) httpFlvStreamService: HttpFlvStreamService,
        @inject(TYPES.IFLVDemuxService) flvVDemuxService: FlvDemuxService,
        @inject(TYPES.IWebcodecsDecoderService) webcodecsDecoderService: WebcodecsDecoderService,
        @inject(TYPES.ICanvasVideoService) canvasVideoService: CanvasVideoService,
        @inject(TYPES.IDebugLogService) debugLogService: DebugLogService,
        @inject(TYPES.IFLVDemuxStream) fLVDemuxStream: FLVDemuxStream,
        @inject(TYPES.IAudioProcessingService) audioProcessingService: AudioProcessingService,
        @inject(TYPES.IWasmDecoderService) wasmDecoderService: WasmDecoderService,
        @inject(TYPES.ICanvasToVideoSerivce) canvasToVideoSerivce: CanvasToVideoSerivce,
        @inject(TYPES.IMseDecoderService) mseDecoderService: MseDecoderService,
        @inject(TYPES.IPreProcessing) preProcessing: PreProcessing,
        @inject(TYPES.IRenderEngine) renderEngine: RenderEngine,
        @inject(TYPES.IRTCPlayerService) rtcPlayerService: RTCPlayerService,
    ) {
        super();
        this.httpFlvStreamService = httpFlvStreamService;
        this.flvVDemuxService = flvVDemuxService;
        this.webcodecsDecoderService = webcodecsDecoderService;
        this.canvasVideoService = canvasVideoService;
        this.debugLogService = debugLogService;
        this.fLVDemuxStream = fLVDemuxStream;
        this.audioProcessingService = audioProcessingService;
        this._opt = Object.assign({}, DEFAULT_PLAYER_OPTIONS);
        this.error_connect_times = 0;
        this.wasmDecoderService = wasmDecoderService;
        this.canvasToVideoSerivce = canvasToVideoSerivce;
        this.mseDecoderService = mseDecoderService;
        this.preProcessing = preProcessing;
        this.renderEngine = renderEngine;
        this.scheduler = new Scheduler(1);
        this.rtcPlayerService = rtcPlayerService;
        this.maxErrorTimes = 100000;
        this._times = {
            playInitStart: '', // 1
            playStart: '', // 2
            streamStart: '', // 3
            streamResponse: '', // 4
            demuxStart: '', // 5
            decodeStart: '', // 6
            videoStart: '', // 7
            playTimestamp: '', // playStart- playInitStart
            streamTimestamp: '', // streamStart - playStart
            streamResponseTimestamp: '', // streamResponse - streamStart_times
            demuxTimestamp: '', // demuxStart - streamResponse
            decodeTimestamp: '', // decodeStart - demuxStart
            videoTimestamp: '', // videoStart - decodeStart
            allTimestamp: '', // videoStart - playInitStart
        };

        this._stats = {
            buf: 0, // 当前缓冲区时长，单位毫秒,
            fps: 0, // 当前视频帧率
            abps: 0, // 当前音频码率，单位bit
            vbps: 0, // 当前视频码率，单位bit
            ts: 0, // 当前视频帧pts，单位毫秒
        };
        window.streamCanvasX = window.__VERSION__ || 'DEV_0.2.4';
    }

    emitOtherInfo(data: { speed: string | number }) {
        let { speed } = data;
        this.emit('otherInfo', { speed });

        console.log(`当前音頻流量：${speed} kBps`);
    }


    init(config?: IplayerConfig) {
        // let { model = UseMode.UseCanvas, url = '', contentEl = null, showAudio = false, hasAudio = true, hasVideo = true, errorUrl = '', useOffScreen = false, audioDraw = 1 } = config;

        // this.logMonitor=new LogMonitor();


        this.config = this.correctConfig(config);

        let { model, url, contentEl, useOffScreen, fileData } = this.config;

        if (fileData) {
            let blobUrl = URL.createObjectURL(fileData);
            url = blobUrl;
        }


        // debugger;

        this.httpFlvStreamService.init(this, url);
        this.flvVDemuxService.init(this);
        if (typeof VideoDecoder != 'undefined') this.webcodecsDecoderService.init(this);
        this.fLVDemuxStream.init(this);
        this.canvasVideoService.init(this, { model: model, contentEl, useOffScreen });
        this.canvasToVideoSerivce.init(this);

        if (config.streamType === 'AAC') {
            // this.mseDecoderService.init(this);
            // this.preProcessing.init(this);
        }
        // this.wasmDecoderService.init();


        if (config.isLive != false || this.config.streamType === 'flv') {
            if (config.isLive === false) {
                return false;
            }
            this.speed = 0;
            this.startHeartbeatCheck();
        }

        // const decode_worker = new Worker(new URL('../decoder/decode_worker.js', import.meta.url));

        // this.debounceReload();
    }

    createBetaPlayer() {
        let videoEl = document.createElement('audio');
        videoEl.src = this.config.url;
        videoEl.style.position = 'absolute';
        videoEl.style.zIndex = '100';
        this.meidiaEl = videoEl;
        this.meidiaEl.autoplay = true;
        this.meidiaEl.controls = true;
        this.config.contentEl.append(this.meidiaEl);
        this.audioProcessingService.init(this, { media_el: this.meidiaEl });

        // this.httpFlvStreamService.fetchStream();

        //  let { hasAudio, showAudio } = this.config;


        //     let media_el = this.mseDecoderService.$videoElement;
        //     this.meidiaEl = media_el;

        //     // debugger;
        //     this.audioProcessingService.init(this, { media_el: media_el });


        // 此處默認靜音
        // this.audioProcessingService.mute(false);
    }
    createWebRtcPlayer() {
        let { url, contentEl } = this.config;
        this.rtcPlayerService.init({ url, contentEl }, this);
        this.rtcPlayerService.runWhep({ url });

        let video = this.rtcPlayerService.videoService.meidiaEl;
        this.meidiaEl = video;
        // this.meidiaEl.style.display = none;
        this.config.showAudio = true;


        setTimeout(() => {
            this.audioProcessingService.init(this, { media_el: video });
            this.config.showAudio = true;
            this.audioProcessingService.mute(true);

            this.audioProcessingService.updateBufferData();
            this.audioProcessingService.render();
        }, 1500);


        // this.canvasVideoService.loading = false;
        // setTimeout(() => {
        //     // this.corePlayer.load();
        //     this.canvasVideoService.createVideoFramCallBack(this.meidiaEl);
        // }, 1000);


        // return false;
    }
    createPlayer(parms: { type?: string; isLive?: boolean; url?: string }) {
        let { streamType, url } = this.config;

        // this.logMonitor.log({ flvUrl: url ,status: "start",statusDesc: "創建实例 手动拉流" });

        if (streamType === 'WEBRTC') {
            this.createWebRtcPlayer();

            // 暂时只有音频 ，写死
            this.emit('mediaInfo', { hasVideo: false, hasAudio: true });
        } else {
            this.createFlvPlayer(parms);
        }
    }
    initAudiPlayer(info: corePlayer.PCMInfo = { sampleRate: 8000, channelCount: 1, format: 's16le' }) {
        // PCM selects the output path before asynchronous Worklet initialization.
        this.audioPlaybackMode = 'audioContext';
        this.stopAudioEvent();
        const muted = this._audioPlayer?.muted ?? (this.config.isMuted === true);
        if (this._audioPlayer && this._audioPlayer.config.sampleRate !== info.sampleRate) {
            // AudioContext's rate is fixed at creation. Recreate only audio output
            // if the device changes rate; the core connection continues receiving.
            clearTimeout(this.audioProcessingService.timeId);
            this._audioPlayer.destroy();
            this._audioPlayer = null;
        }
        if (!this._audioPlayer) {
            this.lastPCMSubmittedAt = undefined;
            const audioPlayer = this._audioPlayer = new AudioPlayer();
            audioPlayer.init({
                sampleRate: info.sampleRate,
                channelCount: info.channelCount,
                bufferSize: this.config.bufferSize,
                updataBufferPerSecond: this.config.updataBufferPerSecond,
                fftSize: this.config.fftsize,
            }).then(() => {
                if (this._audioPlayer !== audioPlayer || !audioPlayer.hasInit) return;
                this.config.showAudio = !this.hasVideoTrack;
                audioPlayer.updatBufferData();
                if (this.config.showAudio) this.audioProcessingService.render();
            }).catch(error => {
                console.error('Failed to initialize PCM playback:', error);
            });
            audioPlayer.mute(muted);
        }
        return this._audioPlayer;
    }

    handleAudioSegment(data: ArrayBuffer, info: corePlayer.PCMInfo = { sampleRate: 8000, channelCount: 1, format: 's16le' }) {
        if (this.initAudiPlayer(info).feedPCMData(data, info)) {
            this.lastPCMSubmittedAt = performance.now();
        }
    }
    createFlvPlayer(parms: { type?: string; isLive?: boolean; url?: string }) {
        try {
            bridge_api.getplayerbuffer();
        } catch (e) {

        }

        if (window.wasmDebug) {
            this.createBetaPlayer2();
            return false;
        }
        let { type = 'flv' } = parms;

        let { isLive, url, fileData, streamType } = this.config;
        // this.logMonitor.log({ flvUrl: url ,status: "start",statusDesc: "創建实例 手动拉流" });
        if (streamType === 'AAC' || streamType === 'MP4') {
            this.createBetaPlayer();
            return false;
        }

        if (fileData) {
            let blobUrl = URL.createObjectURL(fileData);
            url = blobUrl;
        }


        if (streamType == 'MpegTs' || streamType === 'MPEG-TS') {
            type = 'mpegts';
            isLive = false;
            this.config.isLive = false;
        }


        let videoEl = document.createElement('video');
        this.meidiaEl = videoEl;
        if (this.config.hasAudio === false) { // 支持特殊场景首屏播放
            videoEl.muted = true;
        }
        // document.getElementById('cont').append(videoEl);
        // videoEl.controls = true;
        // videoEl.width = 300;

        let { showAudio, hasAudio, hasVideo } = this.config;

        console.log('-----player config--------');
        console.info(this.config);
        console.log('------player config-------');


        // if (hasAudio = true) {
        //     this.audioProcessingService.init(this, { media_el: videoEl });

        //     // 此處默認靜音
        //     this.audioProcessingService.mute(true);
        // }


        // this.audioProcessingService.init(this, { media_el: videoEl });

        let playerCustomConfig = window.playerCustomConfig || {};

        let { enableStashBuffer = false, stashInitialSize = 384, liveBufferLatencyMaxLatency = 1.5 } = playerCustomConfig;


        if (videoEl) {
            if (showAudio === true) {
                this.audioEl = videoEl;
                this.audioProcessingService.init(this, { media_el: videoEl });

                // 此處默認靜音
                this.audioProcessingService.mute(true);
                this.corePlayer = corePlayer.createPlayer({
                    type: type!, // could also be mpegts, m2ts, flv
                    isLive: isLive,
                    url: url,
                    hasAudio: hasAudio,
                    hasVideo: false,

                }, {
                    enableStashBuffer: enableStashBuffer,
                    enableWorker: true,
                    liveBufferLatencyChasing: true,
                    liveBufferLatencyMaxLatency: liveBufferLatencyMaxLatency,
                    lazyLoad: false,
                    stashInitialSize: stashInitialSize,
                });
                this.corePlayer.attachMediaElement(videoEl);
            } else {
                this.corePlayer = corePlayer.createPlayer({
                    type: type!, // could also be mpegts, m2ts, flv
                    isLive: isLive,
                    url: url,
                    splitAVBuffers: true,
                    // hasAudio: hasAudio,
                    // hasVideo: hasVideo,

                }, {

                    enableStashBuffer: enableStashBuffer,
                    enableWorker: true,
                    liveBufferLatencyChasing: true,
                    liveBufferLatencyMaxLatency: liveBufferLatencyMaxLatency,
                    fixAudioTimestampGap: false,
                    autoCleanupSourceBuffer: true,
                    lazyLoad: false,
                    stashInitialSize: stashInitialSize,
                    // // autoCleanupMaxBackwardDuration: 5, // seconds.
                    // autoCleanupMinBackwardDuration: 5,
                    // lazyLoad: false,
                    // liveBufferLatencyMinRemain: 0.1,
                    // lazyLoadMaxDuration: 4,
                    // enableWorker: true,
                    // liveBufferLatencyChasing: true,
                    // autoCleanupSourceBuffer: true,
                    // // autoCleanupMaxBackwardDuration: 5, // seconds.
                    //  autoCleanupMinBackwardDuration: 5,
                    // lazyLoad: false,
                    // liveBufferLatencyMinRemain: 0.1,
                    // lazyLoadMaxDuration: 4, // seconds.
                });
                let audioEl = document.createElement('video');

                this.audioEl = audioEl;


                this.audioProcessingService.init(this, { media_el: audioEl });
                this.audioProcessingService.initCanvas(); // 待优化， 需要手动写

                // 此處默認靜音
                // this.audioProcessingService.mute(true);

                this.corePlayer.attachMediaElement(videoEl, audioEl);
                // if (this.config.isMuted === true) {
                //     setTimeout(() => {
                //         alert('111');
                //         console.log('首次静音', this.config.isMuted);
                //         this.audioProcessingService.mute(true);
                //     }, 200);
                // }


                this.videoEvent(videoEl);
            }

            this.corePlayer.defatulEvent();


            //   this.getVideoSize();
            this.corePlayer.load();

            this.canvasVideoService.drawLoading();

            //   window.pp = this.corePlayer;

            this.corePlayer.on('audio_segment', (data, info) => {
                this.handleAudioSegment(data, info);
            });

            this.corePlayer.on(corePlayer.Events.LOADING_COMPLETE, (parm) => {
                let data = {};

                if (this.config.streamType === 'MpegTs' || this.config.streamType === 'MPEG-TS') {
                    data = {
                        hasVideo: true,
                        hasAudio: true,
                    };
                }


                this.emit('loadingComplete', data);
            });

            if (isLive === false) {
                // this.canvasVideoService.loading = false;
                // setTimeout(() => {
                //     // this.corePlayer.load();

                //     this.corePlayer.play();
                //     // this.canvasVideoService.createVideoFramCallBack(videoEl);
                //     this.canvasVideoService.load(videoEl);
                // }, 1000);
                this.corePlayer.play();
                // this.canvasVideoService.createVideoFramCallBack(videoEl);
                this.config.contentEl.append(videoEl);
                videoEl.style.width = '100%';
                videoEl.style.height = '100%';
                videoEl.controls = true;
                videoEl.style.position = 'absolute';
                videoEl.style.zIndex = '6';
                this.canvasVideoService.loading = false;
                return false;
            }


            // FLV onMetaData is optional. Codec-derived MEDIA_INFO can also start playback.
            const msePlayer = this.corePlayer;
            let playbackStarted = false;
            const startLivePlayback = (isHEVC: boolean) => {
                if (playbackStarted || this.corePlayer !== msePlayer) return;
                playbackStarted = true;
                if (this.config.isMuted === true) {
                    setTimeout(() => {
                        if (this.corePlayer === msePlayer) this.audioProcessingService.mute(true);
                    }, 200);
                }
                this.canvasVideoService.loading = false;
                if (isHEVC && corePlayer.getFeatureList().mseH265Playback === false) {
                    this.destroy();
                    this.wasmModel = true;
                    this.createBetaPlayer2();
                    return;
                }
                msePlayer.play();
            };

            this.corePlayer.on(corePlayer.Events.MEDIA_INFO, (parm) => {
                this.mediaInfo = parm;

                // Stop video checks independently of whether PCM already enabled the waveform.
                if (parm.hasVideo === false) {
                    this.canvasVideoService.mediaView.stopHeartChceck();
                    this.canvasVideoService.mediaView.cancelVideoFrameCallBack();
                    this.meidiaEl = null;
                }


                let { hasVideo } = parm;
                let { hasAudio } = parm;


                //  兼容 flv head 異常
                if (this.hasMediaoInfo === true) {
                    return false;
                } else {
                    this.hasMediaoInfo = true;
                }


                this.emit('mediaInfo', { hasVideo, hasAudio });

                if (hasVideo === false) {
                    this.config.showAudio = true;
                    if (this.audioPlaybackMode === 'audio-element') {
                        this.audioProcessingService.updateBufferData();
                        this.audioEvent();
                    }
                    this.audioProcessingService.render();
                }

                if (hasVideo === true) {
                    this.config.showAudio = false;
                    this.audioProcessingService.clearCanvas();
                }


                startLivePlayback(/^(hvc1|hev1)(\.|$)/.test(parm.videoCodec ?? ''));
            });

            this.corePlayer.on(corePlayer.Events.ERROR, (error, detailError) => {
                console.log('---------');
                console.info(error);
                console.log('---------');
                if (error === corePlayer.ErrorTypes.NETWORK_ERROR || error === corePlayer.ErrorTypes.MEDIA_ERROR) {
                    //     this.canvasVideoService.drawLoading();
                    //    this.reload2();
                    this.addReloadTask({ arr_msg: [`reload: ${error}`] });
                } else {
                    this.addReloadTask({ arr_msg: [`reload: ${error}`] });
                }
            });

            //   this.corePlayer.on(mpegts.Events.LOADING_COMPLETE, () => {
            //     setTimeout(() => {
            //         this.reload2();
            //     }, 8 * 1000);
            //   });

            //   const seedFrame = () => {
            //     setTimeout(() => {
            //     let end = this.corePlayer.buffered.end(0);
            //     let delta = end - this.corePlayer.currentTime; // 获取buffered与当前播放位置的差值
            //     if (delta > 5 || delta < 0) {
            //          this.corePlayer.currentTime = this.corePlayer.buffered.end(0) - 1;
            //       }
            //     }, 9 * 1000);
            //   };
            // let lowSpeedStartTime: number | null = null;
            // let lowSpeedTimer: NodeJS.Timeout;

            //   this.corePlayer.on(corePlayer.Events.STATISTICS_INFO, (data) => {
            //      let { speed, decodedFrames } = data;


            //     if (speed <= 1) {
            //        if (lowSpeedStartTime === null) {
            //             lowSpeedStartTime = Date.now();
            //         }
            //         if (Date.now() - lowSpeedStartTime >= 15000) {
            //             this.addReloadTask({ arr_msg: ['---heartcheck 异常 流量0 ----'] });
            //            lowSpeedStartTime = null; // 重置计时器
            //         }
            //     }
            //     if (speed > 1) {
            //         lowSpeedStartTime = null;
            //         this.error_connect_times = 0;
            //     }

            //     this.emit('otherInfo', data);
            // });

            this.corePlayer.on(corePlayer.Events.STATISTICS_INFO, (data) => {
                let { speed, decodedFrames } = data;

                this.speed = speed;


                if (speed > 1) {
                    this.lowSpeedStartTime = null;
                }

                if (speed <= 1 && this.lowSpeedStartTime === null) {
                    this.lowSpeedStartTime = Date.now();
                } else {
                    // 如果速度大于1，清除定时器并重置状态
                    // if (lowSpeedTimer) {
                    //     clearTimeout(lowSpeedTimer);
                    //     lowSpeedTimer = null;
                    // }
                    // this.error_connect_times = 0;
                    // this.lowSpeedStartTime=null;
                }

                this.emit('otherInfo', data);
            });


            this.corePlayer.on(corePlayer.Events.METADATA_ARRIVED, (parm) => {
                startLivePlayback(parm.videocodecid == 12);
            });
        }


        if (showAudio === false) {
            // this.canvasVideoService.createVideoFramCallBack(videoEl);
            this.canvasVideoService.load(videoEl);
        }
    }


    createMp4player(parm: { type: string }) {
        let config = {};
        let videoEl = document.createElement('video');
        videoEl.style.height = '100%';
        videoEl.style.width = '100%';
        videoEl.controls = true;
        let { type } = parm;

        this.meidiaEl = videoEl;
        this.corePlayer = corePlayer.createPlayer({
            type: type, // could also be mpegts, m2ts, flv
            isLive: false,
            url: this.config.url,
            splitAVBuffers: false,
            // hasAudio: hasAudio,
            // hasVideo: hasVideo,

        }, {

            enableWorker: true,
            autoCleanupSourceBuffer: true,

        });
        this.corePlayer.attachMediaElement(videoEl);
        //    this.corePlayer.load();
        // this.corePlayer.play();
        this.corePlayer.load();
        this.corePlayer.play();


        this.config.contentEl.append(videoEl);
    }

    createTsPlayer() {

    }

    // 独立的心跳检查和重载逻辑
    startHeartbeatCheck() {
        if (this.wasmModel === true) {
            return false;
        }
        if (!this.lowSpeedTimer) {
            this.lowSpeedStartTime = Date.now();
            this.lowSpeedTimer = setInterval(() => {
                // 检查是否需要重载
                // let { speed } = this;
                // let kk=this.lowSpeedStartTime;
                if (this.speed <= 1 && this.lowSpeedStartTime !== null) {
                    if (Date.now() - this.lowSpeedStartTime >= 5000) {
                        // console.log('---heartcheck 异常 流量0 ----');
                        this.addReloadTask({ arr_msg: ['---heartcheck 异常 流量0 ----'] });
                    }
                }
            }, 5000); // 每5秒检查一次
        }
    }

    stopEvent() {

    }

    videoEvent(videoEl: HTMLVideoElement) {
        let video = videoEl;
        let lastTimeReadyStateBelow3: number | null = null; // 最后一次 readyState 小于3的时间
        const timeoutDuration = 5000; // 检查间隔（毫秒）
        const threshold = 3000; // 阈值（毫秒）
        let $this = this;
        let { url = '' } = this.config;

        if (this.config.isLive != true) {
            return false;
        }

        function checkVideoState() {
            if (!$this.hasVideoTrack || $this.meidiaEl !== video) {
                return false;
            }
            // console.log('readystate', video.readyState);
            if (video.readyState < 3 || video.paused === true) {
                if (lastTimeReadyStateBelow3 === null) {
                    lastTimeReadyStateBelow3 = Date.now(); // 开始计时
                }

                const duration: number = Date.now() - lastTimeReadyStateBelow3;
                if (duration >= threshold) {
                    //    $this.canvasVideoService.drawLoading();
                    //    console.log('----readyState reset-----------');
                    //    console.log(`reset:${video.readyState}`);
                    //    console.log('----readyState reset-----------');
                    //    $this.reload2(); // 触发回调函数
                    $this.addReloadTask({ arr_msg: [`readyState 异常 :${video.readyState} ${url}`] });
                    setTimeout(checkVideoState, timeoutDuration); // 继续检查
                } else {
                    setTimeout(checkVideoState, timeoutDuration); // 继续检查
                }
            } else {
                lastTimeReadyStateBelow3 = null; // 重置计时
                setTimeout(checkVideoState, timeoutDuration); // 重新开始计时
            }
        }

        setTimeout(checkVideoState, 5000);


        if (this.meidiaEl) {
            this.meidiaEl.addEventListener('error', (e) => {
                if (!this.hasVideoTrack || this.meidiaEl !== video) return;
                const { error } = (e.target as HTMLVideoElement);
                if (!error) return;
                switch (error.code) {
                    case 1:
                        this.addReloadTask({ arr_msg: [`中断下载 ${url}`] });
                        break;
                    case 2:
                        this.addReloadTask({ arr_msg: [`网络异常中断 ${url}`] });
                        break;
                    case 3:
                        this.addReloadTask({ arr_msg: [`解码失败 ${url}`] });
                        break;
                    case 4:
                        //  console.log('视频格式不支持。');
                        break;
                    default:
                        this.addReloadTask({ arr_msg: [`发生了其他错误 ${url}`] });
                        break;
                }
            });
        }
    }

    stopAudioEvent() {
        clearTimeout(this.audioCheckTimer);
        this.audioCheckTimer = undefined;
        if (this.audioCheckElement && this.audioErrorHandler) {
            this.audioCheckElement.removeEventListener('error', this.audioErrorHandler);
        }
        this.audioCheckElement = undefined;
        this.audioErrorHandler = undefined;
    }

    audioEvent(videoEl?: HTMLVideoElement) {
        this.stopAudioEvent();
        if (this.audioPlaybackMode !== 'audio-element') return;
        const video = videoEl ?? this.audioEl ?? this.meidiaEl;
        if (!video) return;
        this.audioCheckElement = video;
        let lastTimeReadyStateBelow3: number | null = null;
        const timeoutDuration = 1000;
        const threshold = 15000;
        const { url = '' } = this.config;
        const isActive = () =>
            this.audioPlaybackMode === 'audio-element' && this.audioCheckElement === video;

        const checkAudioState = () => {
            if (!isActive()) return;
            if (video.readyState < 3) {
                const now = Date.now();
                if (lastTimeReadyStateBelow3 === null) lastTimeReadyStateBelow3 = now;
                if (now - lastTimeReadyStateBelow3 >= threshold) {
                    this.addReloadTask({ arr_msg: [`readyState 异常 :${video.readyState} ${url}`] });
                    // Give recovery time instead of submitting another task every second.
                    lastTimeReadyStateBelow3 = now;
                }
            } else {
                lastTimeReadyStateBelow3 = null;
            }
            if (isActive()) this.audioCheckTimer = setTimeout(checkAudioState, timeoutDuration);
        };

        this.audioCheckTimer = setTimeout(checkAudioState, 5000);
        this.audioErrorHandler = () => {
            if (!isActive() || !video.error) return;
            const messages: Record<number, string> = {
                1: '中断下载',
                2: '网络异常中断',
                3: '解码失败',
            };
            if (video.error.code === 4) return;
            this.addReloadTask({
                arr_msg: [`${messages[video.error.code] ?? '发生了其他错误'} ${url}`],
            });
        };
        video.addEventListener('error', this.audioErrorHandler);
    }


    createBetaPlayer2() {
        let { url } = this.httpFlvStreamService;
        let container = this.config.contentEl;

        const player = new window.Jessibuca({
            container: container,
            videoBuffer: 0.2, // 缓存时长
            isResize: false,
            text: '',
            loadingText: '加载中',
            debug: false,
            forceNoOffscreen: true,
            isNotMute: true,
            useWCS: false,
            useMSE: false,
            showBandwidth: false, // 显示网速
            hasAudio: true,

        });

        player.play(url);


        player.on('kBps', (data) => {
            this.emit('otherInfo', { speed: data });
        });
        player.on('stats', (s) => {
            this.emit('performaceInfo', { fps: s.fps });
        });


        this.player2 = player;
    }

    destroy() {
        this.stopAudioEvent();
        this.lastPCMSubmittedAt = undefined;
        console.log('----destroy-----1-----');

        if (this.player2) {
            this.player2.destroy();
            this.player2 = null;
        }
        let { url } = this.config;
        this.scheduler.clearQueue();
        this.meidiaEl = null;
        this.canvasVideoService.loading = false;

        try {
            if (this.player2) {
                this.player2.destroy();
                this.player2 = null;
            }
            if (this.corePlayer) {
                this.corePlayer.destroy();

                this.corePlayer = null;
                this.audioEl = null;
                this.meidiaEl = null;
            }
            console.log('----destroy-----2-----');
            if (this.canvasVideoService) {
                this.canvasVideoService.destroy();
                this.canvasVideoService = null;
            }
            if (this.config.streamType === 'WEBRTC') {
                this.rtcPlayerService.destroy();
            }

            console.log('----destroy-----3-----');
            if (this.player2) {
                this.player2.destroy();
                this.player2 = null;
            }
            clearInterval(this.lowSpeedTimer);
            if (this._audioPlayer) {
                this._audioPlayer.destroy();
                this._audioPlayer = null;
            }
        } catch (e) {

        }
        // this.logMonitor.log({ flvUrl: url ,status: "destroy",statusDesc: "销毁实例 终止拉流" });
    }


    play(url: string) {
        this.httpFlvStreamService.fetchStream(url);
    }

    getStatus() {
        let video = this.meidiaEl;
        let data = {
            el: video,
            readay: video.readyState,
            paused: video.paused,
            error_connect_times: this.error_connect_times,
            url: this.config.url,
            taskQueue: this.scheduler.getQueue(),
            ended: video.ended,

        };

        console.info('getStatus', data);
        return data;
    }

    @CorrectDecorator
    correctConfig(config: IplayerConfig): IplayerConfig {
        return config;
    }
    throttle(fn: Function, delay: number) {
        let _start = Date.now();
        return (...args: any[]) => {
            let _now = Date.now();
            let self = this;
            let _args = args;
            if (_now - _start >= delay) {
                fn.apply(self, _args);
                _start = Date.now();
            }
        };
    }


    retry() {
        if (this.corePlayer) {
            this.corePlayer.destroy();
        }
    }

    checkPlaying(): boolean {
        const mediaIsPlaying = (media?: HTMLMediaElement) =>
            !!media && media.readyState >= 3 && !media.paused && !media.ended;
        if (this.audioPlaybackMode === 'audioContext') {
            // Running alone does not prove PCM is being supplied to the Worklet.
            const audioIsPlaying = !!this._audioPlayer?.hasInit &&
                this._audioPlayer.audioContext?.state === 'running' &&
                this.lastPCMSubmittedAt !== undefined &&
                performance.now() - this.lastPCMSubmittedAt < 15000;
            return audioIsPlaying && (!this.hasVideoTrack || mediaIsPlaying(this.meidiaEl));
        }
        const media = this.hasVideoTrack && !this.config.showAudio
            ? this.meidiaEl
            : this.audioEl ?? this.meidiaEl;
        return mediaIsPlaying(media);
    }

    reload2() {
        this.error_connect_times++;
        if (this.wasmModel === true) {
            return false;
        }

        if (this.config.stopCallBack) {
            this.config.stopCallBack().then((res) => {
                if (res.stop === true || res.stop === 'true') {
                    this.error_message = res.message;
                    this.setError();
                } else {
                    this.error_message = '';
                }
            });
        }

        let { url } = this.config;
        // this.logMonitor.log({ flvUrl: url,status: "reloading" });


        if (this.error_connect_times > this.maxErrorTimes) {
            this.canvasVideoService.loading = false;
            this.setError();
            return false;
        } else {
            this.lastPCMSubmittedAt = undefined;
            this.corePlayer.reload();
        }
    }

    addReloadTask(parm?: { arr_msg?: Array<string> }) {
        if (this.wasmModel === true) {
            return false;
        }
        if (this.config.isLive === false) {
            return false;
        }
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
            this.canvasVideoService.drawLoading();
            console.log('=======tasking=======');
            arr_msg.map((msg) => {
                console.log(msg);
            });
            console.log('=======tasking=======');
            this.reload2();
            return new Promise(resolve => setTimeout(() => {
                if (this.checkPlaying()) {
                    this.error_connect_times = 0;
                    resolve('clean');
                } else {
                    resolve('');
                }
            }, 10000)); // 已10s 的速度均衡执行reload 任务
        });
    }

    setError() {
        this.stopAudioEvent();
        console.log('----setError-------');
        // this.canvasVideoService.loading = false;

        clearInterval(this.lowSpeedTimer);
        this.lowSpeedTimer = null;
        this?.canvasVideoService?.mediaView?.stopHeartChceck();

        if (this.canvasVideoService?.loadingView?.isLoading === true) {
            this.canvasVideoService.loading = false;
        }


        this.error_connect_times = this.maxErrorTimes + 100;

        this.corePlayer.pause();
        this.corePlayer.unload();
        this.scheduler.clearQueue();
        // this.corePlayer.destroy();
        if (this.config.showAudio === true) {
            this.audioProcessingService.clearCanvas();
        } else {
            this.canvasVideoService.mediaView.clearCanvas();
        }

        this.canvasVideoService.drawError();
        this.emit('otherInfo', { speed: 0 });
    }


    forceReload() {
        this.error_connect_times = 0;
        this.canvasVideoService.setShowError(false);
        // this.canvasVideoService.clear = false;
        this.addReloadTask({ arr_msg: ['---设备上线 强制重连 ----'] });
        if (this.config.showAudio === true) {
            this.audioProcessingService.clear = false;
            this.audioProcessingService.updateBufferData();
            this.audioProcessingService.render();
            this.canvasVideoService.mediaView.clearCanvas();
        }
        let { url } = this.config;
        // this.logMonitor.log({ flvUrl: url,message: "---设备上线 强制重连 ----'" });

        this.startHeartbeatCheck();
    }
}

export default PlayerService;
