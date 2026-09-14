
import SignalClient from './signalClient';
import StreamSocketClient from './streamSocketClient';
import type { IplayerConfig } from '../../../../types/services';
import Instance from './instance';
import { MessageType } from '../../const';
import { map } from 'lodash';

function generateUniqueId() {
    const now = Date.now();

    const maxInt = 900;

    // 生成一个0到最大安全整数之间的随机整数
    const randomInt = Math.floor(Math.random() * maxInt);


    // const random = Math.floor(Math.random()* in);

    const uniqueId = randomInt;

    return uniqueId;
}

class SocketClient {
    signalClient: SignalClient;
    streamSocketClient: StreamSocketClient;
    clientId: number;
    url: string
    singleton: Instance;

     webSocketConnections: Map<string, {ws_singal: WebSocket;ws_data: WebSocket;status?: string}> = new Map<string, {ws_singal: WebSocket;ws_data: WebSocket;status?: string}>();


    constructor(singleton: Instance) {
        this.singleton=singleton;
        this.signalClient=new SignalClient(this.singleton);
        this.streamSocketClient=new StreamSocketClient(this.singleton);
    }
    init(config: IplayerConfig) {
        this.clientId=generateUniqueId();
        this.url=config.url;

        this.webSocketConnections=new Map();
        this.signalClient.init(this.clientId);
        this.streamSocketClient.init(this.clientId);
    }

    addWebSocketConnection(id: string, ws_singal: WebSocket,ws_data: WebSocket) {
        this.webSocketConnections.set(id,{ ws_singal: ws_singal,ws_data: ws_data });
    }
    deleteWebSocketConnection(id: string) {
        this.webSocketConnections.delete(id);
    }
    updateWebSocketConnection(id: string, status: string) {
        const webSocketData = this.webSocketConnections.get(id);
        webSocketData.status=status;
        this.webSocketConnections.set(id, webSocketData);
    }
    async open() {
        let clientId=generateUniqueId();
        // try{
        //     await this.signalClient.connect();
        //     console.log("signalClient 连接成功");
        //     await this.createPlayer();
        // }catch(e) {

        // }

        // try{
        //     await this.streamSocketClient.connect();
        //     console.log("dataClient 连接成功");
        // }catch(e) {
        //     return false;
        // }


        try {
             let id=String(clientId);


            let res= await Promise.all([this.signalClient.connect(id),this.streamSocketClient.connect(id)]);
            let ws1=res[0]['ws'];
            let ws2=res[1]['ws'];

            this.clientId=clientId;
            this.addWebSocketConnection(String(this.clientId),ws1,ws2);


            console.log("signalClient  connect success");
            console.log("dataClient  connect sucess");
            await this.createPlayer();
        }catch(e) {
            console.error("ws client failed");
        }
    }

    async createPlayer() {
        let { url } = this;
        try{
          let res1= await this.signalClient.callMethd("createPlayer",[url,5,0,1,0]);
          let res2= await this.signalClient.callMethd("play",[]);

          console.log(`player create success   and  url is  ${url}`);
          if(res1.code===200&&res2.code===200) {
            let info=await this.signalClient.getStreamInfo();
          }else{
            console.error("player create failed ");
            self.postMessage({ type: MessageType.ADD_RELOAD_TASK });

            // this.reload();
          }
        }catch(e) {

        }
    }
    async reload() {
        function delay(ms: number) {
            return new Promise(resolve => setTimeout(resolve, ms));
          }

        //   try{
        //     await this.signalClient.callMethd("stop",[]);
        //     console.log("call method stop done");
        //   }catch(e) {

        //   }


        // this.signalClient.destroy();
        // this.streamSocketClient.destroy();
        // this.updateWebSocketConnection(String(this.clientId),"0");


        this.disaConnect(String(this.clientId));


        // await delay(6000);


        await this.open();

        this.streamSocketClient.startHearChceck();
        // debugger;

        // if(!this.signalClient.ws) {
        //    await this.signalClient.connect();
        // }
        // if(!this.streamSocketClient.ws) {
        //    await this.streamSocketClient.connect();
        // }
        try{
            // await this.signalClient.callMethd("stop",[]);

            // await this.createPlayer();
        }catch(e) {

        }
    }

    disaConnect(id: string) {
        this.updateWebSocketConnection(String(this.clientId),"0");
        const webSocketData = this.webSocketConnections.get(id);

        let { ws_data } = webSocketData;
        let { ws_singal } = webSocketData;
        this.streamSocketClient.stopHeartChceck();

        ws_singal.close();
        ws_data.close();
    }
    async play() {
        try{
            await this.signalClient.callMethd("play",[]);
        }catch(e) {

        }
    }

    async abort() {
        try{
            await this.signalClient.callMethd("stop",[]);
        }catch(e) {

        }
    }

   async destroy() {
    console.log("socket client destroy");

    try{
        this.streamSocketClient.stopHeartChceck();
        // await this.signalClient.callMethd("stop",[]);
         console.log("destroy call method stop");
    }catch(e) {
        console.error("destroy error");
     }

        this.signalClient.destroy();
        this.streamSocketClient.destroy();
    }
}

export default SocketClient;
