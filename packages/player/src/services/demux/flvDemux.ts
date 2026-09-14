
import { injectable, inject, Container, LazyServiceIdentifer } from 'inversify';
import Emitter from '../../utils/emitter';
import type { Idemux } from '../../types/services/index';
import BaseDemux from './baseDemux';
import PlayerService from '../player';
const MEDIA_TYPE = {
    audio: 1,
    video: 2,
};


const FLV_MEDIA_TYPE = {
    audio: 8,
    video: 9,
};


  interface IPlayer {
    debug: any;
    _opt: any;
    decoderWorker: any;
    webcodecsDecoder: any;
    mseDecoder: any;
  }


@injectable()
class fLVDemux extends BaseDemux {
    private flvDemux: (data: ArrayBuffer) => void;
    private input: Generator<number>;
    constructor() {
        super();
        this.input = this._inputFlv();
        this.flvDemux = this.dispatchFlvData(this.input);
    }
    // init(playerService: PlayerService) {
    //     this.player = playerService;
    // }

    // 处理一个输入的 ArrayBuffer，并将其解析为多种不同的消息类型
    dispatchFlvData(input: Generator<number>) {
        let need = input.next();
        let buffer: Uint8Array = null;
        return (value: ArrayBuffer) => {
            let data = new Uint8Array(value);
            if (buffer) {
                // 如果存在未处理完的缓冲区数据（在上次的transform调用中），将其与新的数据拼接起来
                let combine = new Uint8Array(buffer.length + data.length);
                combine.set(buffer);
                combine.set(data, buffer.length);
                data = combine;
                buffer = null;
            }
            while (data.length >= need.value) {
                let remain = data.slice(need.value);
                need = input.next(data.slice(0, need.value));
                data = remain;
            }
            if (data.length > 0) {
                buffer = data;
            }
        };
    }

    dispatch(data: any) {
        this.flvDemux(data);
    }


    // 调用 _decode ,pushbuffer
    * _inputFlv(): Generator<number, void, undefined> {
        yield 9;
        const tmp = new ArrayBuffer(4);
        const tmp8 = new Uint8Array(tmp);
        const tmp32 = new Uint32Array(tmp);
        const { player } = this;

        while (true) {
            tmp8[3] = 0;
            const t: Uint8Array = yield 15;
            const type = t[4];
            tmp8[0] = t[7];
            tmp8[1] = t[6];
            tmp8[2] = t[5];
            const length = tmp32[0];
            tmp8[0] = t[10];
            tmp8[1] = t[9];
            tmp8[2] = t[8];
            let ts = tmp32[0];
            if (ts === 0xFFFFFF) {
                tmp8[3] = t[11];
                ts = tmp32[0];
            }
            const payload: Uint8Array = yield length;

            switch (type) {
                case FLV_MEDIA_TYPE.audio:
                    // player._opt.hasAudio 参数判断有没有音频
                    if (true) {
                        // player.updateStats({
                        //     abps: payload.byteLength,
                        // });
                        if (payload.byteLength > 0) {
                         //   this.player.debugLogService.log({ title: '打印视频包内容', info: payload, logkey: 'd' });


                          this._doDecode({ payload, type: MEDIA_TYPE.audio, ts });
                        }
                    }
                    break;
                    case FLV_MEDIA_TYPE.video:
                        // if (!player._times.demuxStart) {
                        //     // player._times.demuxStart = now();
                        // }

                        // player._opt.hasVide
                        if (player._opt.hasVideo = true) {
                            // player.updateStats({
                            //     vbps: payload.byteLength,
                            // });
                            const isIFrame = payload[0] >> 4 === 1;
                            if (payload.byteLength > 0) {
                                tmp32[0] = payload[4];
                                tmp32[1] = payload[3];
                                tmp32[2] = payload[2];
                                tmp32[3] = 0;
                                let cts = tmp32[0];

                             //   this.player.debugLogService.log({ title: '打印视频包内容', info: payload, logkey: 'packetLog' });


                            //  if (isIFrame === false) {
                            //     if (Math.random() <= 0.25) {
                            //         return false;
                            //     }
                            //  }
                                this._doDecode({ payload, type: MEDIA_TYPE.video, ts, isIFrame, cts });
                            }
                        }
                        break;
                }
            }
        }
    }


export default fLVDemux;
