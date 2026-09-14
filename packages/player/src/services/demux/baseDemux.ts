import { injectable } from 'inversify';
import Emitter from '../../utils/emitter';
import PlayerService from '../player';
import type { Idemux } from '../../types/services/index';
const MEDIA_TYPE = {
    audio: 1,
    video: 2,
};

interface IData {
    ts: number;
    cts?: number;
    payload: Uint8Array;
    type: number;
    isIFrame?: boolean;
  }


@injectable()
 class BaseDemux extends Emitter {
     firstTimestamp: number | null;
     startTimestamp: number | null;
     stopId: NodeJS.Timer | null;
     delay: number;
     bufferList: IData[];
     dropping: boolean;
     player: any;

    constructor() {
        super();


        this.stopId = null;
        this.firstTimestamp = null;
        this.startTimestamp = null;
        this.delay = -1;
        this.bufferList = [];
        window.buff2 = this.bufferList;
        this.dropping = false;
    }
    // init(playerService: any) {
    //     this.player = playerService;
    // }

    init(playerService: PlayerService) {
        this.player = playerService;
        this.initInterval();
    }
    // 清理和重置各种数据和状态，并且停止调度。
    destroy() {
        if (this.stopId) {
            clearInterval(this.stopId);
            this.stopId = null;
        }
        this.firstTimestamp = null;
        this.startTimestamp = null;
        this.delay = -1;
        this.bufferList = [];
        this.dropping = false;
        this.off();
    }

    getDelay(timestamp: any) {
        if (!timestamp) {
            return -1;
        }
         // eslint-disable-next-line no-negated-condition
        if (!this.firstTimestamp) {
            this.firstTimestamp = timestamp;
            this.startTimestamp = Date.now();
            this.delay = -1;
        } else {
            if (timestamp) {
                const localTimestamp = (Date.now() - this.startTimestamp);
                const timeTimestamp = (timestamp - this.firstTimestamp);
                if (localTimestamp >= timeTimestamp) {
                    this.delay = localTimestamp - timeTimestamp;
                } else {
                    this.delay = timeTimestamp - localTimestamp;
                }
            }
        }
        return this.delay;
    }

    resetDelay() {
        this.firstTimestamp = null;
        this.startTimestamp = null;
        this.delay = -1;
        this.dropping = false;
    }

    /*
     这个函数的主要作用是根据延迟来处理缓存的音频和视频数据操作buffer缓存池，
     如果延迟过大，会开启丢帧模式，丢弃一些数据以减小延迟。
    */
    initInterval() {
        let _loop = () => {
            let data;
            /*
            从player._opt对象中获取videoBuffer和videoBufferDelay两个参数。
            videoBuffer可最大时长，videoBufferDelay是额外的延迟阈值
            */
            const { videoBuffer } = this.player._opt;
            const { videoBufferDelay } = this.player._opt;

            /*
              bufferList是一个存储音频和视频数据的数组
             */
            if (this.bufferList.length) {
                // 判断是否处于丢帧模式
                if (this.dropping) {
                    // this.player.debug.log('common dumex', `is dropping`);
                    data = this.bufferList.shift();
                    if (data.type === MEDIA_TYPE.audio && data.payload[1] === 0) {
                        this._doDecoderDecode(data);
                    }
                    while (!data.isIFrame && this.bufferList.length) {
                        data = this.bufferList.shift();
                        if (data.type === MEDIA_TYPE.audio && data.payload[1] === 0) {
                            this._doDecoderDecode(data);
                        }
                    }
                    // i frame
                    if (data.isIFrame && this.getDelay(data.ts) <= Math.min(videoBuffer, 200)) {
                        this.dropping = false;
                        this._doDecoderDecode(data);
                    }
                } else {
                    data = this.bufferList[0];
                    if (this.getDelay(data.ts) === -1) {
                        // this.player.debug.log('common dumex', `delay is -1`);
                        this.bufferList.shift();
                        this._doDecoderDecode(data);
                    } else if (this.delay > (videoBuffer + videoBufferDelay)) {
                        // this.player.debug.log('common dumex', `delay is ${this.delay}, set dropping is true`);
                        this.resetDelay();
                        this.dropping = true;
                    } else {
                        data = this.bufferList[0];
                        if (this.getDelay(data.ts) > videoBuffer) {
                            // drop frame
                            this.bufferList.shift();
                            this._doDecoderDecode(data);
                        } else {
                            // this.player.debug.log('common dumex', `delay is ${this.delay}`);
                        }
                    }
                }
            }
        };
        _loop();
        this.stopId = setInterval(_loop, 10);
    }

    //    负责将提取的音频或视频负载数据解码。
        /*
    _doDecode 方法：这个方法的功能是将获得的音频或视频 payload（负载数据）传递给相应的解码器进行解码。
    这个方法根据不同的设置（useWCS、useOffscreen、useMSE 等）选择不同的解码方式。
    如果设置了 useWCS 并且 useOffscreen 未被设置，或者设置了 useMSE，
    那么该方法会将负载数据和相关的选项（如时间戳 ts、编码类型 type、是否为关键帧 isIFrame 等）一起放入缓冲区等待解码。
    如果都没有设置，那么该方法会直接调用相应的音频或视频解码器进行解码。
    */
    _doDecode(data: Idemux['IData']) {
        let { payload, type, ts, isIFrame, cts } = data;


        const { player } = this;
        let options = {
            ts: ts,
            cts: cts,
            type: type,
            isIFrame: false,
        };

        if (type === MEDIA_TYPE.video) {
            options.isIFrame = isIFrame;
           this.pushBuffer(payload, options);
        }
    }

        /*
    _doDecoderDecode 方法：
    这个方法的作用和 _doDecode 方法相似，也是处理音频或视频的解码操作。
    不过，这个方法是直接调用 player 的 decoderWorker 进行解码，
    或者根据不同的设置使用 webcodecsDecoder 或 mseDecoder 进行解码。 */
    _doDecoderDecode(data: Idemux['IData']) {
        const { player } = this;
        const { webcodecsDecoderService } = player;

       if (data.type === MEDIA_TYPE.video) {
        webcodecsDecoderService.decodeVideo(data.payload, data.ts, data.isIFrame);
        }
    }

    pushBuffer(payload: Idemux['IData']['payload'], options: { ts: number; cts?: number; type: number; isIFrame?: boolean }) {
        //  bufferList是一个存储音频和视频数据的数组
        if (options.type === MEDIA_TYPE.audio) {
            this.bufferList.push({
                ts: options.ts,
                payload: payload,
                type: MEDIA_TYPE.audio,
            });
        } else if (options.type === MEDIA_TYPE.video) {
            this.bufferList.push({
                ts: options.ts,
                cts: options.cts,
                payload: payload,
                type: MEDIA_TYPE.video,
                isIFrame: options.isIFrame,
            });
        }
    }

    close() {

    }
}


export default BaseDemux;
