
import { createPlayerServiceInstance } from './serviceFactories/createPlayerInstance';
import { createWaveVisualizationInstance } from './serviceFactories/createWaveVisualizationInstance';
import type { IplayerConfig, IWavePlayerConfig, IWavePlayerExtend } from './types/services';
import { getConfig, loadMicroModule } from './loadMicroModule';
import { createStreamBridgePlayerInstance } from './serviceFactories/createStreamBridgePlayerInstance';
import streamcanvasCore from "@break_happy/streamcanvasx-core"
export { default as MseDecoder } from './services/decoder/mediaSource';
export { default as Scheduler } from './services/player/util/scheduler';
export type { default as PlayerService } from './services/player';
export type {
    IBridgePlayerConfig,
    IplayerConfig,
    IRTCPlayerConfig,
    IWavePlayerConfig,
    IWavePlayerExtend,
} from './types/services';


type ICreatePlayerServiceInstance = ReturnType<typeof createPlayerServiceInstance>;
type ICreateWaveVisualizationInstance = ReturnType<typeof createWaveVisualizationInstance>;
type ICreateStreamBridgePlayerInstance =ReturnType<typeof createStreamBridgePlayerInstance>;


function extractDeviceId(url: string) {
    // 使用 URL 物件解析傳入的 URL
    const parsedUrl = new URL(url);

    // 獲得路徑部分
    const { pathname } = parsedUrl;

    // 分割路徑以取得各部分，假設ID總是在 .live.flv 前面
    const parts = pathname.split('/');

    // 提取包含ID的部分，這裡假設ID總是最後一部分的第一段（去除.live.flv）
    const lastPart = parts[parts.length - 1];
    const id = lastPart.split('.')[0];

    return id;
  }


const createPlayerServicePromise = async function (parm: IplayerConfig): Promise<ICreatePlayerServiceInstance|ICreateStreamBridgePlayerInstance> {
    let { url } = parm;
    let url_obj=new URL(url);
    if(url_obj.protocol==='rtsp:') {
        parm.rtspUrl=url;
    }else{
        if(!parm.rtspUrl===true) {
            let deviceId=extractDeviceId(url);
            let { host,hostname } = url_obj;
            let rtspUrl=`rtsp://${hostname}:42022/rtp/${deviceId}`;
            parm.rtspUrl=rtspUrl;
        }
    }

    return createPlayerServiceInstance(parm);
    try {
        // throw new Error("This is a manually thrown error");
        let module = await loadMicroModule();

        if(window.yuv===true||localStorage.getItem('yuv')==="true") {
            return module.createStreamBridgePlayerInstance(parm);
        }else{
            return module.createPlayerServiceInstance(parm);
        }
    } catch (e) {
        console.log(' 播放器 远程微模块加载失败');

        if(window.yuv===true||localStorage.getItem('yuv')==="true") {
            return createStreamBridgePlayerInstance(parm);
        }else{
            return createPlayerServiceInstance(parm);
        }
    }
};

const createWaveVisualizationPromise = async function (config: IWavePlayerConfig, extend: IWavePlayerExtend): Promise<ICreateWaveVisualizationInstance> {
    try {
        let module = await loadMicroModule();

        return module.createWaveVisualizationInstance(config, extend);
    } catch (e) {
        console.log(' 波形可视化 远程微模块加载失败');
        return createWaveVisualizationInstance(config, extend);
    }
};


window.setYuv=function(parm) {
    if(parm===true) {
        localStorage.setItem("yuv",'true');
    }else{
        localStorage.setItem('yuv','false');
    }
};
window.getYuv=function() {
    return localStorage.getItem('yuv');
};

export {
    createPlayerServiceInstance,
    createPlayerServicePromise,
    createWaveVisualizationPromise,
    createWaveVisualizationInstance,
    createStreamBridgePlayerInstance,
    streamcanvasCore
};
