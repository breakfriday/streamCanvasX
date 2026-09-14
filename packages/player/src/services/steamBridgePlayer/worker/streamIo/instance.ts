
import { MessageType } from '../../const';
import SocketClient from './socketClinet';
class InstanceWorker {
    private static instance: InstanceWorker | null = null;

    socketClient: SocketClient
    constructor() {
        this.init();
    }
    init() {
        this.socketClient=new SocketClient(this);


        // this.yuvEngine.init();
        // debugger;
    }

    static getInstance() {
        if (!InstanceWorker.instance) {
            InstanceWorker.instance = new InstanceWorker();
        }
        return InstanceWorker.instance;
    }


    play() {
         this.socketClient.open();
    }
    onMessage(event: MessageEvent<any>) {
        let { type,data } =event.data;


        switch (type) {
            case MessageType.INIT_CONFIG:

                this.socketClient.init(data);
                   break;
            case MessageType.OPEN_SOCKET:
                    this.play();
                    break;
            case MessageType.RELOAD:
                    // debugger;
                    this.socketClient.reload();
                    break;
            case MessageType.CLOSE_SOCKET:
                    this.socketClient.destroy();
                    break;
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