
import type { IplayerConfig } from "../../../../types/services";
import { UseMode } from "../../../../constant";

function removeNullAndUndefined(obj: any): any {
    let newObj = { ...obj }; // Shallow copy of the object to avoid modifying the original
    Object.keys(newObj).forEach(key => {
        if (newObj[key] === null || newObj[key] === undefined) {
            delete newObj[key];
        }
    });
    return newObj;
}

function CorrectDecorator(target: any, propertyName: string, descriptor: PropertyDescriptor): PropertyDescriptor {
    const originalMethod = descriptor.value;

    descriptor.value = function(config: IplayerConfig,...args: any[]): IplayerConfig { // 确保degree作为参数
        const default_config: IplayerConfig = {
            model: UseMode.UseCanvas,
            url: '',
            showAudio: false,
            hasAudio: true,
            hasVideo: true,
            errorUrl: '',
            useOffScreen: false,
            audioDraw: 1,
            updataBufferPerSecond: 15,
            renderPerSecond: 15,
            fftsize: 128,
            bufferSize: 0.2,
            streamType: 'flv',
            isLive: true,
            splitAVBuffers: true,
            audioPlayback: {
                method: 'MSE'
            }
        };
        config = removeNullAndUndefined(config);

        config = Object.assign(default_config, config);

        if(config.streamType==="MPEG-TS"||config.streamType==="MpegTs"||config.streamType==="MP4") {
            config.isLive=false;
            config.hasControl=true;
        }

        if(config.isLive===true) {
            config.hasControl=false;
        }


        return config;
    };

    return descriptor;
}

export { CorrectDecorator };
