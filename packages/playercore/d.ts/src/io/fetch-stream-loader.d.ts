import { BaseLoader } from './loader.js';
interface SeekHandler {
    getConfig(url: string, range: Range): any;
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
    reuseRedirectedURL?: string;
    headers?: Headers;
}
declare class FetchStreamLoader extends BaseLoader {
    TAG: string;
    _seekHandler: SeekHandler;
    _config: IConfig;
    _needStash: boolean;
    _requestAbort: boolean;
    _abortController: AbortController | null;
    _contentLength: number | null;
    _receivedLength: number;
    _dataSource: DataSource;
    _range: Range;
    static isSupported(): boolean;
    constructor(seekHandler: any, config: any);
    destroy(): void;
    open(dataSource: any, range: any): void;
    abort(): void;
    _handleError(e: any): void;
    processStream(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void>;
    _pump(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void>;
}
export default FetchStreamLoader;
