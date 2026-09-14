
import PlayerService from "../../index";


// 在主线程和 Worker 都可见的地方定义消息类型
const MessageType = {
    RENDER_FRAME: 'render_frame',
    UPDATE_SETTINGS: 'update_settings',
    TERMINATE: 'terminate'
  };


function generateUniqueID() {
    const timestamp = new Date().getTime().toString(36); // 获取时间戳并转换为36进制
    const randomString = Math.random().toString(36).substring(2, 15); // 生成随机字符串
    return timestamp + randomString;
}

interface YUVFrame {
    yData: Uint8Array;
    uData: Uint8Array;
    vData: Uint8Array;
    width: number;
    height: number;
    actualRowWidth: number;
    validWidth: number;
  }

class StreamSocketClient {
    playerService: PlayerService;
     ws: WebSocket | null = null;
    private lastMsgId = 0;
    previousTimestamp = 0;
    frameCount = 0;
    fps = 0;
    clientId: number
    hasAudioPlayer: boolean;
    timer: NodeJS.Timeout;
    timenow: number;
    lastTime: number;
    heartCheck: boolean
    constructor() {
        this.hasAudioPlayer=false;
    }
    init(playerService: PlayerService,clientId?: number) {
        this.playerService=playerService;
        this.clientId=clientId;
        this.startHearChceck();
    }

    private connectSocket(id: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.ws) {
                resolve();
                return;
            }
            let { clientId } = this;

            this.ws = new WebSocket(`ws://127.0.0.1:4300/ws/data/${clientId}`);

            this.ws.binaryType = 'arraybuffer';

            this.ws.onopen = () => resolve();
            this.ws.onerror = (event) => reject(event);
            this.ws.onmessage = this.onMessage.bind(this);
            this.ws.onclose = () => {
                console.log('dataclient  WebSocket closed');
                // this.ws = null;
            };
        });
    }
    connect(): Promise<void> {
        let id=generateUniqueID();// 生成唯一id
        return this.connectSocket(id);
    }

    onMessage(event: MessageEvent) {
        // 接收到的数据是一个ArrayBuffer
        const data = new DataView(event.data);

        // 协议头: 固定4字节
        const header = data.getUint32(0);
        if (header !== 0xFFFFFFFF) {
            console.error('Invalid header');
            return;
        }

        // 数据类型: 1字节
        const dataType = data.getUint8(4);
        // if (dataType != 1) { // 0x00为音频，0x01为视频
        //     console.log('Not video data');
        //     return;
        // }
        if(dataType==1||dataType==0||dataType==2) {
            this.timenow=performance.now();
        }

        if(dataType===1) {
            if(this.playerService.enableWorker===true) {
                this.processFrame(null,data.buffer);
                return false;
            }
               // 解析视频相关信息
        const pts = data.getBigUint64(5);// 6位 8字节
        let width = data.getUint16(13);// 14 2字节
        const height = data.getUint16(15);// 16   8字节

        const yStride = data.getUint16(17);
        const uStride = data.getUint16(25);
        const vStride = data.getUint16(27);
        // const dataLength = data.getUint32(29);

        // 计算Y, U, V数据起始位置和大小
        const headerSize = 27; // 协议头到数据长度字节数的总长度
        const yDataSize = yStride * Number(height);
        const uDataSize = yDataSize / 4;
        const vDataSize = yDataSize / 4;

        let actualRowWidth=yDataSize/height;
        let validWidth=Number(width);
        if(actualRowWidth>width) {
           // console.log("存在填充数据，启用兼容模式");
            width=actualRowWidth;
        }
        // debugger;

        const yData = new Uint8Array(event.data, headerSize, yDataSize);
        const uData = new Uint8Array(event.data, headerSize + yDataSize, uDataSize);
        const vData = new Uint8Array(event.data, headerSize + yDataSize + uDataSize, vDataSize);

        let yuvData = {

            width: Number(width),
            height: Number(height),
            yData,
            uData,
            vData,
            yDataSize,
            uDataSize,
            vDataSize,
            actualRowWidth: Number(actualRowWidth),
            validWidth

        };

        // this.timenow=performance.now();
        // console.info(yuvData);
        this.processFrame(yuvData,data.buffer);
        } else if (dataType === 0) { // 0x00为音频
            // 解析音频相关信息
            const pts = data.getBigUint64(5); // 8字节
            const sampleRate = data.getUint16(13); // 2字节
            const channelCount = data.getUint8(15); // 1字节
            const bitDepth = data.getUint8(16); // 1字节
            const pcmDataLength = data.getUint32(17); // 4字节

            const headerSize = 21; // 协议头到PCM数据的总长度
            const pcmData = new Uint8Array(event.data, headerSize, pcmDataLength);

            let audioData = {
                pts: pts,
                sampleRate: Number(sampleRate),
                channelCount: Number(channelCount),
                bitDepth: Number(bitDepth),
                pcmData
            };

            // debugger
            if(this.hasAudioPlayer) {
                let floatdata=this.playerService.audioProcessingService.pcmPlayer.convertInt16ArrayToFloat32(pcmData.buffer);
                this.playerService.audioProcessingService.feed(floatdata);
            }else{
                this.playerService.audioProcessingService.createplayer({ sampleRate,numberOfOutputChannels: 1,isLive: true,bufferSize: 1024 });
                this.hasAudioPlayer=true;
                let { streamInfo } = this.playerService?.streamIo?._ioLoader.signalClient;
                let { hasAudio,hasVideo }=streamInfo;
                if(hasAudio===true&&hasVideo===false) {
                    this.playerService.audioProcessingService.pcmPlayer.showAudio();
                }
            }
        }else{

        }

        this.playerService.mediaRenderEngine.clearLoading();
    }

    processFrame(frame: YUVFrame,data: ArrayBuffer) {
        // this.playerService._worker.postMessage();


       let { enableWorker } = this.playerService;
       if(enableWorker===true) {
        this.playerService._worker.postMessage({
            type: MessageType.RENDER_FRAME,
            data: data
          }, [data]);
       }else{
        this.playerService.mediaRenderEngine.yuvEngine.update_yuv_texture(frame);
       }
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    destroy() {
        this.stopHeartChceck();
        this.disconnect();
    }

    startHearChceck() {
        if (!this.timer) {
          this.timer = setInterval(() => {
             if(this.lastTime>=this.timenow) {
              this.playerService.addReloadTask({ arr_msg: ['---fps 調用鏈檢查異常 ----'] });
              this.heartCheck=true;
             }else{
              // console.log(this.lastCount)
              // console.log(this.nowFrameCount)
              // debugger
              this.heartCheck=false;
              this.lastTime=this.timenow;
             }
            }, 10000); // 每10秒检查一次
        }
      }

       stopHeartChceck() {
        if(this.timer) {
          clearInterval(this.timer);
          this.timer=null;
         }
       }
}


export default StreamSocketClient;