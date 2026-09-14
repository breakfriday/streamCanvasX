
import Log from '../utils/logger.js';
import Browser from '../utils/browser.js';
import {BaseLoader, LoaderStatus, LoaderErrors} from './loader.js';
import {RuntimeException} from '../utils/exception.js';



interface SeekHandler {
    getConfig(url: string, range: Range): any; // Define the type for 'any' based on actual use
    removeURLParameters(url: string): string;
}

interface DataSource {
    url: string;
    redirectedURL?: string;
    cors?: boolean;
    withCredentials?: boolean;
    referrerPolicy?: string;
}

interface Range {
    from: number;
    to?: number;
}

interface IConfig {
    isLive: boolean;
    reuseRedirectedURL?:string,
    headers?:Headers
}

interface RequestInit {
    body?: BodyInit | null;
    cache?: RequestCache;
    credentials?: RequestCredentials;
    headers?: HeadersInit;
    integrity?: string;
    keepalive?: boolean;
    method?: string;
    mode?: RequestMode;
    redirect?: RequestRedirect;
    referrer?: string;
    referrerPolicy?: ReferrerPolicy;
    signal?: AbortSignal | null;
    window?: null;
}

class FetchStreamLoader extends BaseLoader {


     TAG: string = 'FetchStreamLoader';
     _seekHandler: SeekHandler;
     _config: IConfig; // Define the type for 'any' based on actual use
     _needStash: boolean = true;
     _requestAbort: boolean = false;
     _abortController: AbortController | null = null;
     _contentLength: number | null = null;
     _receivedLength: number = 0;
     _dataSource: DataSource;
     _range: Range;

    static isSupported() {
        try {
            // fetch + stream is broken on Microsoft Edge. Disable before build 15048.
            // see https://developer.microsoft.com/en-us/microsoft-edge/platform/issues/8196907/
            // Fixed in Jan 10, 2017. Build 15048+ removed from blacklist.
            let isWorkWellEdge = Browser.msedge && Browser.version.minor >= 15048;
            let browserNotBlacklisted = Browser.msedge ? isWorkWellEdge : true;
            return (self.fetch && self.ReadableStream && browserNotBlacklisted);
        } catch (e) {
            return false;
        }
    }

    constructor(seekHandler, config) {
        super('fetch-stream-loader');
        this.TAG = 'FetchStreamLoader';

        this._seekHandler = seekHandler;
        this._config = config;
        this._needStash = true;

        this._requestAbort = false;
        this._abortController = null;
        this._contentLength = null;
        this._receivedLength = 0;
    }

    destroy() {
        if (this.isWorking()) {
            this.abort();
        }
        super.destroy();
    }

    open(dataSource, range) {
        this._dataSource = dataSource;
        this._range = range;

        let sourceURL = dataSource.url;
        if (this._config.reuseRedirectedURL && dataSource.redirectedURL != undefined) {
            sourceURL = dataSource.redirectedURL;
        }

        let seekConfig = this._seekHandler.getConfig(sourceURL, range);

        let headers = new self.Headers();

        if (typeof seekConfig.headers === 'object') {
            let configHeaders = seekConfig.headers;
            for (let key in configHeaders) {
                if (configHeaders.hasOwnProperty(key)) {
                    headers.append(key, configHeaders[key]);
                }
            }
        }

        let params:RequestInit = {
            method: 'GET',
            headers: headers,
            mode: 'cors',
            cache: 'default',
            // The default policy of Fetch API in the whatwg standard
            // Safari incorrectly indicates 'no-referrer' as default policy, fuck it
            referrerPolicy: 'no-referrer-when-downgrade'
        };

        // add additional headers
        if (typeof this._config.headers === 'object') {
            for (let key in this._config.headers) {
                headers.append(key, this._config.headers[key]);
            }
        }

        // cors is enabled by default
        if (dataSource.cors === false) {
            // no-cors means 'disregard cors policy', which can only be used in ServiceWorker
            params.mode = 'same-origin';
        }

        // withCredentials is disabled by default
        if (dataSource.withCredentials) {
            params.credentials = 'include';
        }

        // referrerPolicy from config
        if (dataSource.referrerPolicy) {
            params.referrerPolicy = dataSource.referrerPolicy;
        }

        if (self.AbortController) {
            this._abortController = new self.AbortController();
            params.signal = this._abortController.signal;
        }

        this._status = LoaderStatus.kConnecting;
        self.fetch(seekConfig.url, params).then((res) => {
            if (this._requestAbort) {
                this._status = LoaderStatus.kIdle;
                res.body.cancel();
                return;
            }
            if (res.ok && (res.status >= 200 && res.status <= 299)) {
                if (res.url !== seekConfig.url) {
                    if (this._onURLRedirect) {
                        let redirectedURL = this._seekHandler.removeURLParameters(res.url);
                        this._onURLRedirect(redirectedURL);
                    }
                }

                let lengthHeader = res.headers.get('Content-Length');
                if (lengthHeader != null) {
                    this._contentLength = parseInt(lengthHeader);
                    if (this._contentLength !== 0) {
                        if (this._onContentLengthKnown) {
                            this._onContentLengthKnown(this._contentLength);
                        }
                    }
                }


                let stream=res.body
                let streamReader = stream?.getReader();

                return this._pump.call(this, streamReader);
            } else {
                this._status = LoaderStatus.kError;
                if (this._onError) {
                    this._onError(LoaderErrors.HTTP_STATUS_CODE_INVALID, {code: res.status, msg: res.statusText});
                } else {
                    throw new RuntimeException('FetchStreamLoader: Http code invalid, ' + res.status + ' ' + res.statusText);
                }
            }
        }).catch((e) => {
            if (this._abortController && this._abortController.signal.aborted) {
                return;
            }

            this._status = LoaderStatus.kError;
            if (this._onError) {
                this._onError(LoaderErrors.EXCEPTION, {code: -1, msg: e.message});
            } else {
                throw e;
            }
        });
    }

    abort() {
        this._requestAbort = true;

        console.log("fetch  abort")
       
        if (this._status !== LoaderStatus.kBuffering || !Browser.chrome) {
            // Chrome may throw Exception-like things here, avoid using if is buffering
            if (this._abortController) {
                try {
                    this._abortController.abort();
                } catch (e) {}
            }
        }
    }

    _handleError(e) {
        // 这里实现错误处理逻辑
        if (this._abortController && this._abortController.signal.aborted) {
            this._status = LoaderStatus.kComplete;
            return;
        }
    
        this._status = LoaderStatus.kError;
        let type = LoaderErrors.EXCEPTION;
        let info = { code: e.code, msg: e.message };

        // 判断是否被提前结束， 流在完全下载之前就被关闭了。
        // e.message === 'network error'
            if((this._contentLength === null || (this._contentLength !== null && this._receivedLength < this._contentLength))){
                type = LoaderErrors.EARLY_EOF;
                info = {code: e.code, msg: 'Fetch stream meet Early-EOF'};  
            }else{
                type = LoaderErrors.EXCEPTION;
                info = {code: e.code, msg: e.message};
            }
    
        if (this._onError) {
            this._onError(type, info);
        } else {
            throw new RuntimeException(info.msg);
        }
    }
    

    async processStream(reader:ReadableStreamDefaultReader<Uint8Array>){
        try {
            //使用 while (true) 循环来不断读取数据，直到 done 为 true 时跳出循环。
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    // 处理完成逻辑
                    if (this._contentLength !== null && this._receivedLength < this._contentLength) {
                        // 报告提前结束
                        this._status = LoaderStatus.kError;
                        const type = LoaderErrors.EARLY_EOF;
                        const info = { code: -1, msg: 'Fetch stream meet Early-EOF' };
                        if (this._onError) {
                            this._onError(type, info);
                        } else {
                            throw new RuntimeException(info.msg);
                        }
                    } else {
                        // 完成下载
                        this._status = LoaderStatus.kComplete;
                        if (this._onComplete) {
                            this._onComplete(this._range.from, this._range.from + this._receivedLength - 1);
                        }
                    }
                    break;  // 跳出循环
                }
    
                // 处理数据块
                let chunk = value.buffer;
                let byteStart = this._range.from + this._receivedLength;
                this._receivedLength += chunk.byteLength;
    
                if (this._onDataArrival) {
                    this._onDataArrival(chunk, byteStart, this._receivedLength);
                }
            }
        } catch (e) {
            // 处理异常
            this._handleError(e)
        }

    }
    _pump(reader:ReadableStreamDefaultReader<Uint8Array>) {  // ReadableStreamReader
        return reader.read().then((result) => {
            if (result.done) {
                // First check received length
                if (this._contentLength !== null && this._receivedLength < this._contentLength) {
                    // Report Early-EOF
                    this._status = LoaderStatus.kError;
                    let type = LoaderErrors.EARLY_EOF;
                    let info = {code: -1, msg: 'Fetch stream meet Early-EOF'};
                    if (this._onError) {
                        this._onError(type, info);
                    } else {
                        throw new RuntimeException(info.msg);
                    }
                } else {
                    // OK. Download complete
                    this._status = LoaderStatus.kComplete;
                    if (this._onComplete) {
                        this._onComplete(this._range.from, this._range.from + this._receivedLength - 1);
                    }
                }
            } else {
                if (this._abortController && this._abortController.signal.aborted) {
                    this._status = LoaderStatus.kComplete;
                    return;
                } else if (this._requestAbort === true) {
                    this._status = LoaderStatus.kComplete;
                    return reader.cancel();
                }

                this._status = LoaderStatus.kBuffering;

                let chunk = result.value.buffer;
                let byteStart = this._range.from + this._receivedLength;
                this._receivedLength += chunk.byteLength;

                if (this._onDataArrival) {
                    this._onDataArrival(chunk, byteStart, this._receivedLength);
                }

                this._pump(reader);
            }
        }).catch((e) => {
            if (this._abortController && this._abortController.signal.aborted) {
                this._status = LoaderStatus.kComplete;
                return;
            }

            if (e.code === 11 && Browser.msedge) {  // InvalidStateError on Microsoft Edge
                // Workaround: Edge may throw InvalidStateError after ReadableStreamReader.cancel() call
                // Ignore the unknown exception.
                // Related issue: https://developer.microsoft.com/en-us/microsoft-edge/platform/issues/11265202/
                return;
            }

            this._status = LoaderStatus.kError;
            let type:number|string = 0;
            let info = null;

            if ((e.code === 19 || e.message === 'network error') && // NETWORK_ERR
                (this._contentLength === null ||
                (this._contentLength !== null && this._receivedLength < this._contentLength))) {
                type = LoaderErrors.EARLY_EOF;
                info = {code: e.code, msg: 'Fetch stream meet Early-EOF'};
            } else {
                type = LoaderErrors.EXCEPTION;
                info = {code: e.code, msg: e.message};
            }

            if (this._onError) {
                this._onError(type, info);
            } else {
                throw new RuntimeException(info.msg);
            }
        });
    }

}

export default FetchStreamLoader;
