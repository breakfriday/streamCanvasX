
import { MessageType } from '../../const';
import YuvEngine from './renderEngin';
class InstanceWorker {
    private static instance: InstanceWorker | null = null;
    yuvEngine: YuvEngine
    constructor() {
        this.init();
    }
    init() {
        this.yuvEngine=new YuvEngine();


        // this.yuvEngine.init();
        // debugger;
    }

    static getInstance() {
        if (!InstanceWorker.instance) {
            InstanceWorker.instance = new InstanceWorker();
        }
        return InstanceWorker.instance;
    }


    parseData(eventData: ArrayBuffer) {
        // debugger;
        const data = new DataView(eventData);
        // debugger;
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

        const yData = new Uint8Array(eventData, headerSize, yDataSize);
        const uData = new Uint8Array(eventData, headerSize + yDataSize, uDataSize);
        const vData = new Uint8Array(eventData, headerSize + yDataSize + uDataSize, vDataSize);

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


        this.yuvEngine.update_yuv_texture(yuvData);
    }

    play() {
        // this.socketClient.open();
    }
    onMessage(event: MessageEvent<any>) {
        let { type,data } =event.data;


        switch (type) {
            case MessageType.RENDER_FRAME:

                this.parseData(data);
                break;
            case MessageType.INIT_WORKER_CANVAS:
                 this.yuvEngine.initNewOffscreenCanvs(data);
                break;
            case MessageType.INIT_CANVAS_TRANSFERCONTROL:
                  this.yuvEngine.initTransferControlCanvs(data);
                  break;
            case MessageType.RELOAD_CANVAS:
                this.yuvEngine.reload();
                  break;
            case MessageType.RESIZE:
                this.yuvEngine.setCanvasSize(data);
                  break;

            // case MessageType.INIT_CONFIG:

            //     //    this.socketClient.init(data);
            //        break;
            // case MessageType.OPEN_SOCKET:
            //         this.play();
            //         break;
            // case MessageType.RELOAD:
            //         // debugger;
            //         // this.socketClient.reload();
            //         break;
            default:
             break;
            // Add more cases here as needed
        }

        // if(type==MessageType.RENDER_FRAME) {
        //     this.parseData(data);
        // }else{

        // }
    }
}

export default InstanceWorker;