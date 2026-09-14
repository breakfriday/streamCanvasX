import { injectable, inject, Container, LazyServiceIdentifer } from 'inversify';
import PlayerService from '../player';
import { TYPES } from '../../serviceFactories/symbol';

import CodecParser from 'codec-parser';
import Sm4js from 'sm4js';

import { addScript, addScript2 } from '../../utils';

import { createRateLimitedReadableStream } from '../../utils/stream';


// import CodecParser from '../decoder/CodecParser/index';
@injectable()
class HttpFlvStreamLoader {
    private _requestAbort: boolean;
    private _abortController: AbortController;
    private _abortController2: AbortController;
    private _requestAbort2: boolean;
    private _chunks2: Array<Uint8Array>;
    private playerService: PlayerService;
    public url: string;
    private downLoadConfig: {loading: boolean; text: string; startTime: number};
    private streamParser: CodecParser;


    private sm4Instance: any;


    private bufferLength: number; // 初始缓冲区长度

    maxHeartTimes: number;
    hertTime: number;
    constructor(
        // @inject(new LazyServiceIdentifer(() => TYPES.IPlayerService)) playerService: PlayerService,

        // @inject(new LazyServiceIdentifer(() => TYPES.IPlayerService)) playerService: PlayerService,

    ) {
        this.requestAbort = false;
        this.hertTime = 0;
        this.maxHeartTimes = 10;

        this.bufferLength = 160;


        // this.beforInit();


        // this.playerService = playerService;
    }


    static isSupported() {
        if (window.fetch && window.ReadableStream) {
             return true;
        } else {
            console.log('Fetch and Stream API are not supported');
            return false;
        }
    }
    get requestAbort(): boolean {
        return this._requestAbort;
    }
    set requestAbort(value: boolean) {
        this._requestAbort = value;
    }
    get abortController() {
        return this._abortController;
    }

    init(playerService: PlayerService, url: string) {
        this.playerService = playerService;
        this.url = url;
    }

    // 统一 公用别名
    open() {
        this.fetchStream();
    }
   // 统一 公用别名
    abort() {
        this.abortFetch();
    }
    destroy() {
        this.abort();
    }

   bufferToBase64(buffer: ArrayBuffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
   }

   base64tobuffer(base64: any) {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
   }

    concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
        let totalLength = 0;
        for (const arr of arrays) {
            totalLength += arr.length;
        }

        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const arr of arrays) {
            result.set(arr, offset);
            offset += arr.length;
        }

        return result;
    }


    bufferToString(buffer: ArrayBuffer) {
        let decoder = new TextDecoder('utf-8');
        return decoder.decode(buffer);
    }
    stringToUint8arry(str: string) {
        const encoder = new TextEncoder(); // TextEncoder 的默认字符集是 'utf-8'
        return encoder.encode(str);
    }


    async fetchStream(): Promise<void> {
        // try {
        //  await this._initAll();
        // } catch (e) {
        //     console.error('error ');
        // }


        let { url, fileData } = this.playerService.config;
        let $this = this;

        let stream: ReadableStream;
        let streamReader: ReadableStreamDefaultReader<any>;


        if (fileData) {
            const reader = new FileReader();
            reader.readAsArrayBuffer(fileData);

            reader.onload = function (e) {
                const arrayBuffer: ArrayBuffer = this.result;
                // const stream = new ReadableStream({
                //     start(controller) {
                //         controller.enqueue(new Uint8Array(arrayBuffer));
                //         controller.close();
                //     },
                // });

                const stream = new createRateLimitedReadableStream();
               // stream.enqueue(new Uint8Array(arrayBuffer));

                stream.equeneAll(new Uint8Array(arrayBuffer));

                const reader = stream.stream.getReader();
                if (reader) {
                     $this.processStream(reader);
                }
            };
        } else {
            let headers = new Headers();
            this._abortController = new AbortController();
            let params: RequestInit = {
                method: 'GET',
                mode: 'cors', // cors is enabled by default
                credentials: 'same-origin', // withCredentials is disabled by default
                headers: headers,
                cache: 'default',
                referrerPolicy: 'no-referrer-when-downgrade',
                signal: this.abortController.signal,

            };

            try {
                const response: Response = await fetch(url, params);
                if (this.requestAbort === true) {
                    response.body.cancel();

                    return;
                }

                // fetch API 的 Response 对象的 body 属性是一个 ReadableStream 流。
                 stream = response.body;
                // streamReader = stream?.getReader();
                // if (streamReader) {
                //     await this.processStream(streamReader);
                // }
            } catch (e) {

            }
        }


        streamReader = stream?.getReader();
        if (streamReader) {
            await this.processStream(streamReader);
        }
    }

    abortFetch(): void {
        this.abortController.abort();
    }

    downLoadBlob(blob: Blob) {
        let url = window.URL.createObjectURL(blob);
        let a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = 'canvaToVideo.flv';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
    }

    async downLoad() {
        const controller = new AbortController();
        this._abortController2 = controller;
        const { signal } = controller;
        let { url } = this;
        let tempUrl = new URL(url);
        let downUrl = `${location.protocol}//${tempUrl.host}${tempUrl.pathname}`;
        this._requestAbort2 = false;
        let requestAbort = this._requestAbort2;


        const downloadBlob = (blob: Blob) => {
            let url = window.URL.createObjectURL(blob);
            let a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = 'canvaToVideo.flv';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
        };


    try {
        const response: Response = await fetch(downUrl, { signal });
        // if (requestAbort === true) {
        //     response.body.cancel();
        //     return;
        // }
        const stream = response.body;
        const reader = stream?.getReader();
        const chunks = this._chunks2 = [];
        if (reader) {
            while (true) {
                const { value, done } = await reader.read();

                if (done || requestAbort) {
                  break;
                }

                chunks.push(value);
            }
        }
    } catch (e) {
        if (e.name === 'AbortError') {
            const chunks = this._chunks2;
            const blob = new Blob(chunks, { type: 'video/x-flv' });
            this.downLoadBlob(blob);
        }
    }
    }

    abortDownLoad() {
        let controller = this._abortController2;
        let chunks = this._chunks2;
        if (controller) {
            controller.abort();
            // const blob = new Blob(chunks, { type: 'video/x-flv' });
            // this.downLoadBlob(blob);
            this._requestAbort2 = true;
        }
    }


    // async processStream(reader: ReadableStreamDefaultReader): Promise<void> {
    //     while (true) {
    //         try {
    //             const { done, value } = await reader.read();

    //             const chunk = value?.buffer;
    //             // console.log(chunk);
    //             if (done) {
    //                 console.log('Stream complete');
    //                 return;
    //             }

    //             this.playerService.flvVDemuxService.dispatch(value);

    //            // this.playerService.fLVDemuxStream.dispatch(value);

    //             // Your process goes here, where you can handle each chunk of FLV data
    //             // For example:
    //             // this.processFlvChunk(value);
    //         } catch (e) {
    //             console.error('Error reading stream', e);
    //             return;
    //         }
    //     }
    // }


    async processStream(reader: ReadableStreamDefaultReader): Promise<void> {
        this.playerService.preProcessing.processStream(reader);
    }

    processFlvChunk(chunk: Uint8Array): void {


    }
}

export default HttpFlvStreamLoader;