import { injectable, inject, Container, LazyServiceIdentifer } from 'inversify';
import Emitter from '../../utils/emitter';
import PlayerService from '../player';


function now(): number {
    return new Date().getTime();
}


const formatVideoDecoderConfigure = (avcC: Uint8Array): { codec: string; description: Uint8Array } => {
    let codecArray = avcC.subarray(1, 4);
    let codecString = 'avc1.';
    for (let j = 0; j < 3; j++) {
        let h = codecArray[j].toString(16);
        if (h.length < 2) {
            h = `0${h}`;
        }
        codecString += h;
    }

    return {
        codec: codecString,
        description: avcC,
    };
};


 const ENCODED_VIDEO_TYPE = {
    key: 'key',
    delta: 'delta',
};


const EVENTS = {
    fullscreen: 'fullscreen$2',
    webFullscreen: 'webFullscreen',
    decoderWorkerInit: 'decoderWorkerInit',
    play: 'play',
    playing: 'playing',
    pause: 'pause',
    mute: 'mute',
    load: 'load',
    loading: 'loading',
    videoInfo: 'videoInfo',
    timeUpdate: 'timeUpdate',
    audioInfo: 'audioInfo',
    log: 'log',
    error: 'error',
    kBps: 'kBps',
    timeout: 'timeout',
    delayTimeout: 'delayTimeout',
    loadingTimeout: 'loadingTimeout',
    stats: 'stats',
    performance: 'performance',
    record: 'record',
    recording: 'recording',
    recordingTimestamp: 'recordingTimestamp',
    recordStart: 'recordStart',
    recordEnd: 'recordEnd',
    recordCreateError: 'recordCreateError',
    buffer: 'buffer',
    videoFrame: 'videoFrame',
    start: 'start',
    metadata: 'metadata',
    resize: 'resize',
    streamEnd: 'streamEnd',
    streamSuccess: 'streamSuccess',
    streamMessage: 'streamMessage',
    streamError: 'streamError',
    volumechange: 'volumechange',
    destroy: 'destroy',
    mseSourceOpen: 'mseSourceOpen',
    mseSourceClose: 'mseSourceClose',
    mseSourceBufferError: 'mseSourceBufferError',
    mseSourceBufferBusy: 'mseSourceBufferBusy',
    mseSourceBufferFull: 'mseSourceBufferFull',
    videoWaiting: 'videoWaiting',
    videoTimeUpdate: 'videoTimeUpdate',
    videoSyncAudio: 'videoSyncAudio',
    playToRenderTimes: 'playToRenderTimes',
};
const EVENTS_ERROR = {
    playError: 'playIsNotPauseOrUrlIsNull',
    fetchError: 'fetchError',
    websocketError: 'websocketError',
    webcodecsH265NotSupport: 'webcodecsH265NotSupport',
    webcodecsDecodeError: 'webcodecsDecodeError',
    webcodecsWidthOrHeightChange: 'webcodecsWidthOrHeightChange',
    mediaSourceH265NotSupport: 'mediaSourceH265NotSupport',
    mediaSourceFull: EVENTS.mseSourceBufferFull,
    mseSourceBufferError: EVENTS.mseSourceBufferError,
    mediaSourceAppendBufferError: 'mediaSourceAppendBufferError',
    mediaSourceBufferListLarge: 'mediaSourceBufferListLarge',
    mediaSourceAppendBufferEndTimeout: 'mediaSourceAppendBufferEndTimeout',
    wasmDecodeError: 'wasmDecodeError',
    webglAlignmentError: 'webglAlignmentError',
};
 const VIDEO_ENC_CODE = {
    h264: 7,
    h265: 12,
};
 const WCS_ERROR = {
    keyframeIsRequiredError: 'A key frame is required after configure() or flush()',
    canNotDecodeClosedCodec: "Cannot call 'decode' on a closed codec",
};


interface VideoInfo {
    width: number;
    height: number;
    encTypeCode?: number;
  }

  interface Times {
    videoStart?: number;
    decodeStart?: number;
  }


  @injectable()
 class WebcodecsDecoder extends Emitter {
    private player: PlayerService;
    private hasInit: boolean;
    private isDecodeFirstIIframe: boolean;
    private isInitInfo: boolean;
    private decoder: any | null;
    constructor() {
        super();

        this.hasInit = false;
        this.isDecodeFirstIIframe = false;
        this.isInitInfo = false;
        this.decoder = null;
    }
    init(playerService: PlayerService) {
        this.player = playerService;
         this.initDecoder();
    }
    destroy() {
        if (this.decoder) {
            if (this.decoder.state !== 'closed') {
                this.decoder.close();
            }
            this.decoder = null;
        }

        this.hasInit = false;
        this.isInitInfo = false;
        this.isDecodeFirstIIframe = false;
        this.off();
    }

    // 用于初始化解码器
    initDecoder() {
        const _this = this;
        this.decoder = new VideoDecoder({
            output(videoFrame) {
                _this.handleDecode(videoFrame);
                videoFrame.close();
            },
            error(error) {
                _this.handleError(error);
            },
        });
    }

    // 处理解码后的视频帧
    handleDecode(videoFrame: VideoFrame) {
        if (!this.isInitInfo) {
            // this.player.video.updateVideoInfo({
            //     width: videoFrame.codedWidth,
            //     height: videoFrame.codedHeight,
            // });
            // this.player.video.initCanvasViewSize();


            this.isInitInfo = true;
        }

        this.player.debugLogService.info({ title: 'videoFrame', info: videoFrame, logkey: 'videoFrame' });


        this.player.canvasVideoService.render(videoFrame);


        // if (!this.player._times.videoStart) {
        //     this.player._times.videoStart = now();
        //     this.player.handlePlayToRenderTimes();
        // }

        // this.player.handleRender();
        // this.player.video.render({
        //     videoFrame,
        // });

        // this.player.updateStats({ fps: true, ts: 0, buf: this.player.demux.delay });
    }

    // 处理解码过程中的错误
    handleError(error: Error) {
        console.error(error);
        // this.player.debug.error('Webcodecs', 'VideoDecoder handleError', error);
    }

    // 对视频数据进行解码
    decodeVideo(payload: Uint8Array, ts: number, isIframe: boolean): void {
        // eslint-disable-next-line no-negated-condition
        if (!this.hasInit) { // 初始化解码器
            if (isIframe && payload[1] === 0) { // 是关键帧且payload的第2个字节为0
                // 获取视频编码方式
                const videoCodec: number = (payload[0] & 0x0F);

                // 如果解码出来的是
                if (videoCodec === VIDEO_ENC_CODE.h265) {
                    console.log('不支持 H265');
                    return;
                }
                if (!this.player._times.decodeStart) {
                    this.player._times.decodeStart = now();
                }

            /*
              payload.slice(5) 这个操作是从关键帧数据中提取出AVCDecoderConfigurationRecord的部分。
              具体来说，前5个字节是FLV格式定义的固定头部，包含了一些基本的信息，例如帧类型（关键帧或非关键帧）和编码格式（例如H.264）。
              所以这里需要跳过前5个字节，从第6个字节开始才是AVCDecoderConfigurationRecord。

              codec：编码格式，例如"vp8"、"vp9"、"avc"（H.264）等。
            codedWidth 和 codedHeight：视频的宽度和高度。
             other fields：可能还包含其他一些信息，例如比特率、帧率等，具体的内容可能会根据编码格式和实际的需求有所不同。
              */
                const config = formatVideoDecoderConfigure(payload.slice(5));
                let h = this.decoder;
                debugger;
                this.decoder.configure(config);
                // hasInit 视频解码器是否已经初始化
                this.hasInit = true;
            }
        } else {
           // 如果还没有解码过关键帧，并且当前帧是关键帧
            if (!this.isDecodeFirstIIframe && isIframe) {
               // 标记已经解码过第一个关键帧
                this.isDecodeFirstIIframe = true;
            }

            /*
            isDecodeFirstIIframe 确保在解码非关键帧之前，至少已经解码过一个关键帧。
            只有当 isDecodeFirstIIframe 为 true（表示已经解码过至少一个关键帧）时，才会尝试去解码非关键帧。
             */
            if (this.isDecodeFirstIIframe) {
                  // 创建一个新的已编码视频块，包含了视频数据、时间戳和帧类型
                const chunk: EncodedVideoChunk = new EncodedVideoChunk({
                    data: payload.slice(5), // 帧的原始数据。这应该是一个包含编码的视频数据的BufferSource（如ArrayBuffer或TypedArray）。
                    timestamp: ts, // 帧的时间戳，通常表示帧在视频中的播放位置，单位是微秒。时间戳的起点应该是视频的开始。 0就是视频第一帧
                    type: isIframe ? ENCODED_VIDEO_TYPE.key : ENCODED_VIDEO_TYPE.delta, /* type :帧类型。  "key"关键帧，delta 非关键帧 */
                });
                this.player.emit(EVENTS.timeUpdate, ts);
                try {
                    if (this.isDecodeStateClosed()) {
                        return;
                    }
                    this.decoder.decode(chunk);
                } catch (e: any) {
                    if (e.toString().indexOf(WCS_ERROR.keyframeIsRequiredError) !== -1) {
                        this.player.emit(EVENTS_ERROR.webcodecsDecodeError);
                    } else if (e.toString().indexOf(WCS_ERROR.canNotDecodeClosedCodec) !== -1) {
                        this.player.emit(EVENTS_ERROR.webcodecsDecodeError);
                    }
                }
            } else {

            }
        }
    }

    isDecodeStateClosed() {
        return this.decoder.state === 'closed';
    }
}


export default WebcodecsDecoder;