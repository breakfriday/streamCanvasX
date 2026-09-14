import { injectable, inject, Container, LazyServiceIdentifer } from 'inversify';
import { EVENTS, EVENTS_ERROR, MEDIA_TYPE, WASM_ERROR, WORKER_CMD_TYPE, WORKER_SEND_TYPE } from '../../constant/config';

@injectable()
class WasmDecoder {
    decoderWorker: Worker;
    constructor() {

    }
     init() {
        this.decoderWorker = new Worker('http://localhost:3000/decoder.js');
     }
    _initDecoderWorker() {
        this.decoderWorker.onmessage = (event) => {
            console.log('----------------');
            const msg = event.data;
            console.log(msg);
            console.log('----------------');
            switch (msg.cmd) {
                case WORKER_CMD_TYPE.init:

                    break;
                case WORKER_CMD_TYPE.videoCode:

                    break;
                case WORKER_CMD_TYPE.audioCode:

                    break;
                case WORKER_CMD_TYPE.initVideo:

                    break;
                case WORKER_CMD_TYPE.initAudio:

                    break;
                case WORKER_CMD_TYPE.render:

                    break;
                case WORKER_CMD_TYPE.playAudio:

                    break;
                case WORKER_CMD_TYPE.wasmError:

                    break;
                default:
                    break;
            }
        };
    }
}


export default WasmDecoder;