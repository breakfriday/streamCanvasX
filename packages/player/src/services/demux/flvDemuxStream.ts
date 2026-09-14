
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


const FLV_HEADER_SIZE = 9;
const FLV_PACKET_HEADER_SIZE = 15;

  interface IPlayer {
    debug: any;
    _opt: any;
    decoderWorker: any;
    webcodecsDecoder: any;
    mseDecoder: any;
  }


@injectable()
class FLVDemuxStream extends BaseDemux {
    private flvDemux: (data: ArrayBuffer) => void;
    private input: Generator<number>;
    private flvStream: TransformStream;
    private streamWriter: WritableStreamDefaultWriter;

    constructor() {
        super();
        this.createFlvStream();
    }

    createFlvStream() {
        let buffer: Uint8Array = null; // Move
        // 创建了一个 ArrayBuffer 对象，并对其进行了两种类型的视图（View）映射。
        // tmp8 和 tmp32 都引用的是同一个内存中的数据
        const tmp = new ArrayBuffer(4);
        const tmp8 = new Uint8Array(tmp);
        const tmp32 = new Uint32Array(tmp);
        const $this = this;
        let headerProcessed = false;
        this.flvStream = new TransformStream({
            start(controller) {
                // Initial setup, if needed
              },
              transform(chunk: ArrayBuffer, controller) {
                // 将输入的ArrayBuffer转换成Uint8Array
                let data = new Uint8Array(chunk);
                // 如果存在未处理完的缓冲区数据（在上次的transform调用中），将其与新的数据拼接起来
                if (buffer) {
                    let combined = new Uint8Array(buffer.length + data.length);
                    combined.set(buffer);
                    combined.set(data, buffer.length);
                    data = combined;
                    buffer = null;
                }

                // 如果未处理头部，去除FLV文件头部，前9个字节是文件头部
                if (headerProcessed === false && data.length >= FLV_HEADER_SIZE) {
                    const header = data.slice(0, FLV_HEADER_SIZE);
                    // 在此处处理头部数据...  （可以获取头部数据里的一些信息）
                    // 切掉已处理的头部数据，保留剩余数据以处理后续的FLV数据包
                    data = data.slice(FLV_HEADER_SIZE);
                    headerProcessed = true;
                }

                  // 循环处理剩余的FLV数据包，每个数据包至少包含15个字节的包头部 ,Process packets
                    while (data.length >= FLV_PACKET_HEADER_SIZE) {
                        // 获取当前数据包的头部信息
                        const packetHeader = data.slice(0, FLV_PACKET_HEADER_SIZE);
                        // 在此处处理包头数据...

                        // 利用包头数据中的信息计算数据包的长度
                        tmp8[3] = 0;
                        // 获取数据包的类型， 第五个字节
                        const type = packetHeader[4];
                        tmp8[0] = packetHeader[7];
                        tmp8[1] = packetHeader[6];
                        tmp8[2] = packetHeader[5];
                        const length = tmp32[0];
                        // tmp8[0] = packetHeader[10];
                        // tmp8[1] = packetHeader[9];
                        // tmp8[2] = packetHeader[8];

                         let ts = tmp32[0];
                        if (ts === 0xFFFFFF) {
                             tmp8[3] = packetHeader[11];
                            ts = tmp32[0];
                        }

                        //  判断剩余的数据长度是否足够包含一个完整的数据包（包头 + 包体）。如果不够，就将剩余的数据存入缓冲区，等待下一次新数据的到来。
                        // 如果足够，就会继续在循环中处理下一个数据包。
                        // 如果剩余的数据长度小于数据包的长度，则退出循环，将剩余数据存入缓冲区，等待下次的transform调用
                        if (data.length < length + FLV_PACKET_HEADER_SIZE) {
                            break;
                        }

                        // 提取出数据包的payload
                        const payload = data.slice(FLV_PACKET_HEADER_SIZE, length + FLV_PACKET_HEADER_SIZE);

                        // 根据数据包的类型，对payload进行处理
                        switch (type) {
                            case FLV_MEDIA_TYPE.audio:
                                // 处理音频数据
                                $this.processAudioPayload({ payload, type: MEDIA_TYPE.audio, ts });
                                break;
                            case FLV_MEDIA_TYPE.video:
                                // 处理视频数据
                                $this.processVideoPayload({ payload, type: MEDIA_TYPE.audio, ts, tmp32 });
                                break;
                        }

                        // 切掉已处理的数据包，保留剩余数据以处理后续的FLV数据包
                        data = data.slice(length + FLV_PACKET_HEADER_SIZE);
                        if (data.length > 0) {
                            buffer = data;
                        }
                    }
              },
              flush(controller) {
                console.log('[flush]');
                // final processing, if needed
            },
        });

        this.streamWriter = this.flvStream.writable.getWriter();

        this.flvStream.readable.pipeTo(new WritableStream({
            write(chunk) {
              // 在这里处理接收到的数据
              console.log('Received:', chunk);
            },
            close() {
              // 当转换流关闭时的清理操作
              console.log('Transformation completed.');
            },
          }));
    }

    parseChunks(chunk: ArrayBuffer, controller) {

    }

    processAudioPayload(data: {payload: Uint8Array; type: number; ts: number}) {
        let { payload } = data;
        this.player.debugLogService.log({ title: '打印音频包内容', info: payload, logkey: 'packetLog' });
    }

    processVideoPayload(data: {payload: Uint8Array; type: number; ts: number; tmp32: Uint32Array}) {
        let { payload, type, ts, tmp32 } = data;
        const isIFrame = payload[0] >> 4 === 1;
        if (payload.byteLength > 0) {
            tmp32[0] = payload[4];
            tmp32[1] = payload[3];
            tmp32[2] = payload[2];
            tmp32[3] = 0;
            let cts = tmp32[0];
            this.player.debugLogService.log({ title: '打印视频包内容', info: payload, logkey: 'packetLog' });
            // this._doDecode({ payload, type: MEDIA_TYPE.video, ts, isIFrame, cts });
        }
    }

  async dispatch(data: ArrayBuffer) {
       await this.streamWriter.write(data);
        // writer.releaseLock();
    }

    destroy(): void {
        this.streamWriter.releaseLock();
    }
}


export default FLVDemuxStream;
