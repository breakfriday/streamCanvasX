
import { injectable, inject, Container, LazyServiceIdentifer } from 'inversify';
interface IFLVDemuxerOptions {
    uri: string | null;
    onVideoData: Function | null;
}

class Logger {
    private name: string;

    constructor(name: string) {
        this.name = name;
    }

    logInfo(message: string) {
        console.log(`[INFO] ${this.name}: ${message}`);
    }

    logError(message: string) {
        console.error(`[ERROR] ${this.name}: ${message}`);
    }
}
@injectable()
class FLVDemuxer {
    private uri: string | null;
    private ws: WebSocket | null;
    private logger: Logger;
    private outputCount: number;
    private hexString: string;
    private hexChar: string[];
    private _onVideoData: Function | null;
    private state: number;
    private bodyState: number;
    private signature: string;
    private version: number;
    private hasAudio: boolean;
    private hasVideo: boolean;
    private offset: number;
    private type: number;
    private size: number;
    private timestamp: number;
    private streamId: number;

    constructor() {
        this.uri = null;
        this.ws = null;
        this.logger = new Logger('Downloader');
        this.outputCount = 0;
        this.hexString = '';
        this.hexChar = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F'];
        this._onVideoData = null;
        this.state = 0; // 0: header, 1: body
        this.bodyState = 0; // 0: size, 1: tag header, 2: tag body
        this.signature = '';
        this.version = 0x01;
        this.hasAudio = false;
        this.hasVideo = false;
        this.offset = 0x00;
        this.type = 0x00;
        this.size = 0;
        this.timestamp = 0;
        this.streamId = 0;
    }

    init() {

    }

    byteToHex(b: number): string {
        return this.hexChar[(b >> 4) & 0x0f] + this.hexChar[b & 0x0f];
    }

    parseHeader(buffer: ArrayBuffer): boolean {
        let uint8Buffer = new Uint8Array(buffer);
        let sliceArray = uint8Buffer.slice(0, 3);

        this.signature = new TextDecoder('utf-8').decode(sliceArray);
        this.version = uint8Buffer[3];
        if (this.signature != 'FLV' || this.version != 0x01) {
            return false;
        }

        let flags = uint8Buffer[4];
        this.hasAudio = ((flags & 4) >>> 2) == 1;
        this.hasVideo = (flags & 1) == 1;
        return true;
    }

    parseTagHeader(buffer: ArrayBuffer) {
        let uint8Buffer = new Uint8Array(buffer);
        this.type = uint8Buffer[0];
        let ts0 = uint8Buffer[4] << 16 + uint8Buffer[5] << 8 + uint8Buffer[6];
        let ts1 = uint8Buffer[7];
        this.timestamp = (ts1 << 24) | ts0;
    }

    demux(data: ArrayBuffer) {
        if (this.state === 0) {
            if (this.parseHeader(data) == false) {
                this.logger.logError(`parseHeader error ${data}`);
                return;
            }
            this.state = 1;
        } else if (this.state === 1) {
            if (this.hasVideo == false) {
                return;
            }

            if (this.bodyState === 0) {
                this.bodyState = 1;
            } else if (this.bodyState === 1) {
                this.bodyState = 2;
                this.parseTagHeader(data);
            } else if (this.bodyState === 2) {
                if (this.type === 0x09) {
                    this._onVideoData && this._onVideoData(data, this.timestamp);
                }
                this.bodyState = 0;
            }
        }
    }

    open({ uri, onVideoData }: IFLVDemuxerOptions) {
        this.uri = uri;
        this._onVideoData = onVideoData;
        if (this.ws === null) {
            this.ws = new WebSocket(this.uri as string);
            this.ws.binaryType = 'arraybuffer';

            this.ws.onopen = (evt: Event) => {
                this.logger.logInfo('Ws connected.');
                console.log(`FLVDemuxer: ${uri}`);
            };

            this.ws.onerror = (evt: MessageEvent) => {
                this.logger.logError(`Ws connect error ${evt.data}`);
            };

            this.ws.onclose = (evt: CloseEvent) => {
                this.logger.logError(`Ws connect close ${evt.code}`);
            };

            this.ws.onmessage = (evt: MessageEvent) => {
                this.demux(evt.data as ArrayBuffer);
            };
        }
    }

    close() {
        if (this.ws !== null) {
            this.ws.close();
            this.ws = null;
        }
        this._onVideoData = null;
        this.logger = new Logger('Downloader');
        this.state = 0;
        this.bodyState = 0;
        this.uri = null;
        this.timestamp = 0;
    }
}
