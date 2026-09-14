import { frame } from 'codec-parser';
import PlayerService from '../index';

interface YUVFrame {
    yData: Uint8Array;
    uData: Uint8Array;
    vData: Uint8Array;
    width: number;
    height: number;
  }


class FetchLoader {
    playerService: PlayerService;
    private _abortController: AbortController;
    constructor() {

    }
    get abortController() {
        return this._abortController;
    }
    init(playerService: PlayerService) {
        this.playerService=playerService;
    }
    open() {
        this.fetch_io();
    }

    async fetch_io() {
        let { url,frameHeight,frameWidth,renderFps } = this.playerService.config;
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();

        let offset = 0;

        while (offset < arrayBuffer.byteLength) {
            const ySize = frameWidth * frameHeight;
            const uvSize = (frameWidth / 2) * (frameHeight / 2);

            // 创建 Uint8Array 视图用于分别访问 Y, U, V 数据
            const yData = new Uint8Array(arrayBuffer, offset, ySize);
            offset += ySize;

            const uData = new Uint8Array(arrayBuffer, offset, uvSize);
            offset += uvSize;

            const vData = new Uint8Array(arrayBuffer, offset, uvSize);
            offset += uvSize;

            // 使用获取的 Y, U, V 数据渲染一帧

            let yuvData={
              yData,uData,vData
            };
            console.info(yuvData);


            this.processFrame({ yData,uData,vData,width: frameWidth,height: frameHeight });


            // 等待下一帧（这里需要根据实际帧率进行调整）
            await new Promise(resolve => setTimeout(resolve, 1000 /renderFps)); // 假设视频是 30 FPS
        }
    }
    processFrame(frame: YUVFrame) {
        this.playerService.mediaRenderEngine.yuvEngine.update_yuv_texture(frame);
    }
    abort() {

    }
    detroy() {

    }
    process() {

    }
}

export default FetchLoader;