import { container1 } from '../container';
import AudioProcessingService from '../services/audioProcessingService';
import { TYPES } from './symbol';
import type { IAudioProcessingService } from '../types/services';
import { interfaces } from 'inversify';


container1.bind<interfaces.Factory<AudioProcessingService>>(TYPES.IAudioProcessingService)
.toFactory<IAudioProcessingService>((context: interfaces.Context) => {
  return (parmams: { media_el?: HTMLAudioElement; canvas_el?: HTMLCanvasElement}): AudioProcessingService => {
   let instance = new AudioProcessingService(parmams);
   return instance;
  };
});


// 创建一个工厂函数来创建 AudioProcessingService实例
function createAudioProcessingService(): IAudioProcessingService {
  return container1.get<IAudioProcessingService>(TYPES.IAudioProcessingService);
}

function createAudioProcessingServiceInstance(parmams: { media_el?: HTMLMediaElement; canvas_el?: HTMLCanvasElement}) {
  const AudioProcessingServiceFactory: (parmams: { media_el?: HTMLAudioElement; canvas_el?: HTMLCanvasElement}) => AudioProcessingService = container1.get<interfaces.Factory<AudioProcessingService>>(TYPES.IAudioProcessingService);
  const instance = AudioProcessingServiceFactory(parmams);
  return instance;
}


export { createAudioProcessingServiceInstance };
