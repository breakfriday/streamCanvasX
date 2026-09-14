import { injectable, inject, Container, LazyServiceIdentifer } from 'inversify';
import PlayerService from '../index';
import FetchLoader from "./fetch_loader";
import { BridgePlayerStreamType } from '../../../constant';
import SocketClient from './socketClient';
@injectable()
class StreamIo {
    _ioLoader: SocketClient
    playerService: PlayerService
    constructor() {

    }
    init(playerService: PlayerService) {
        this.playerService=playerService;
        let { stremType } = this.playerService.config;
        if(stremType===BridgePlayerStreamType.http_yuv) {
            this._ioLoader=new FetchLoader();
        }else {
            this._ioLoader=new SocketClient();
        }

        this._ioLoader.init(playerService);
    }
    open() {
        this._ioLoader.open();
    }
    abort() {
        this._ioLoader.abort();
    }

    process() {

    }

    destroy() {
        this._ioLoader.destroy();
    }
}

export default StreamIo;