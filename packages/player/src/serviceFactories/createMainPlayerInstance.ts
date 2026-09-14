import { container1 } from '../container';
import AudioProcessingService from '../services/audioProcessingService';
import mainPlayerService from '../services/mainCanvasPlayer';
import { TYPES } from './symbol';
import type { IAudioProcessingService } from '../types/services';
import { interfaces } from 'inversify';
import type { ImainPlayerService } from '../types/services';

// const worker = new Worker(new URL('work.js', import.meta.url));


container1.bind<interfaces.Factory<mainPlayerService>>(TYPES.IMainPlayerService)
.toFactory<mainPlayerService>((context) => {
    return (parmams: Parameters<ImainPlayerService['factory']>[0]) => {
        let instance = new mainPlayerService(parmams);
        return instance;
    };
});


function createMainPlayerInstance(parmams: Parameters<ImainPlayerService['factory']>[0]) {
//    const MainPlayer=
  const MainPlayerFactory: (parmams: Parameters<ImainPlayerService['factory']>[0]) => mainPlayerService = container1.get<interfaces.Factory<mainPlayerService>>(TYPES.IMainPlayerService);
  let instance = MainPlayerFactory(parmams);
  return instance;
}

export { createMainPlayerInstance };
