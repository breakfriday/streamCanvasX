
import PlayerService from "../../index";

type PlayerParams = {
    url: string;
    timeout: number;
    playerType: number;
    transportType: number;
    hardDecode: number;
};

type ApiResponse = {
    type: string;
    msgId: string|number;
    timestamp: number;
    method: string;
    code: number;
    message: string;
    data: any[];
};

type ApirParams = {
    type: string;
    method: string;
    params: Array<any>;
};

function generateUniqueID() {
    const timestamp = new Date().getTime().toString(36); // 获取时间戳并转换为36进制
    const randomString = Math.random().toString(36).substring(2, 15); // 生成随机字符串
    return timestamp + randomString;
}

class SignalClient {
     ws: WebSocket | null = null;

    private responseMap = new Map<number|string, (response: any) => void>(); // 使用responseMap来存储每个msgId对应的解析函数
    playerService: PlayerService
    private lastMsgId = 0;
    clientId: number;
    private _mediaStreamInfoPromise: Promise<void>;
    private _mediaStreamInfoNotify: (data: any) => void;
    streamInfo: {
        hasVideo: boolean;
        hasAudio: boolean;
    }

    constructor() {

    }

    init(playerService: PlayerService,clientId?: number) {
        this.playerService=playerService;
        this.clientId=clientId;
        this.promiseInit();
        // let { url } = this.playerService.config;
     }

     promiseInit() {
        this._mediaStreamInfoPromise = new Promise((resolve) => {
            this._mediaStreamInfoNotify = resolve;
          });
     }


    private connectSocket(id: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.ws) {
                resolve();
                return;
            }

            let { clientId } = this;

            this.ws = new WebSocket(`ws://127.0.0.1:4300/ws/signal/${clientId}`);
            console.log('-cc ws-');

            this.ws.onopen = () => resolve();
            this.ws.onerror = (event) => reject(event);
            this.ws.onmessage = this.onMessage.bind(this);
            this.ws.onclose = () => {
                console.log('signalClient  WebSocket closed');
                // this.ws = null;
            };
        });
    }

    connect(): Promise<void> {
        let id=generateUniqueID();// 生成唯一id
        return this.connectSocket(id);
    }

    handleMessage(event: MessageEvent) {
        const response: ApiResponse = JSON.parse(event.data);
        const resolve = this.responseMap.get(Number(response.msgId));

        if (resolve) {
            resolve(response);
            this.responseMap.delete(Number(response.msgId));
        }
    }

    private onMessage(event: MessageEvent): void {
        const message: ApiResponse = JSON.parse(event.data);

        // 处理不同类型的消息（例如，api响应，回调）
        switch (message.type) {
            case 'api':
                 this.handleMessage(event);
                break;
            case 'callback':
                this.handleCallback(message);
                break;
            default:
                console.error('未知的消息类型', message.type);
        }
    }


    private handleCallback(message: ApiResponse): void {
        // 实现回调处理逻辑
        // console.log('回调:', callback);
        if(message.method==="streamInfo") {
            type CustomArrayType = [boolean, number, number, boolean, number, number, number, ...any[]];

            let { data } = message;

            this._mediaStreamInfoNotify(data);

            let hasVideo=data[0];
            let hasAudio=data[3];

            this.streamInfo={ hasVideo,hasAudio };

            this.playerService.emit('mediaInfo', { hasVideo: hasVideo, hasAudio: hasAudio });
        }
        if(message.method==="realTimeInfo") {
            let { data } = message;
            let [fps,speed] =data;

            this.playerService.emit('performaceInfo',{ fps: fps });

           speed=speed/1000;
           this.playerService.emit('otherInfo', { speed: data });
        }
        if(message.method==='statusInfo') {
            let { data } = message;
            // debugger
        }
    }

     getStreamInfo() {
        if (!this._mediaStreamInfoPromise) {
            this._mediaStreamInfoPromise = new Promise((resolve) => {
              this._mediaStreamInfoNotify = resolve;
            });
          }
          return this._mediaStreamInfoPromise;
    }


    send(method: string, params: any[] = []): void {
        if (!this.ws) {
            console.error('WebSocket 未连接');
            return;
        }

        const message = {
            msgId: this.generateMsgId(),
            timestamp: Date.now(),
            method,
            params,
        };

        this.ws.send(JSON.stringify(message));
    }
    private getNextMessageId(): number {
        return ++this.lastMsgId;
    }

    callMethd(method: string,params: ApirParams['params']): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.ws) {
                console.error('WebSocket 未连接');
                reject();
            }
            const msgId = this.getNextMessageId();
            this.responseMap.set(msgId, resolve);
            let timestamp=new Date().getTime();

            const message = JSON.stringify({ msgId, method,timestamp, params });
            this.ws!.send(message);

            // setTimeout(() => {
            //     if (this.responseMap.has(msgId)) {
            //         this.responseMap.delete(msgId);
            //         console.error(`信令响应 超时 60000`+`method${method}`);
            //         reject(new Error('信令响应 超时 60000'));
            //     }
            // }, 60000); // 设置超时时间， 避免堆积。
        });
    }

    private generateMsgId(): string {
        return Math.random().toString(36).substring(2, 15);
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
    destroy() {
        this.disconnect();
    }
}

export default SignalClient;

