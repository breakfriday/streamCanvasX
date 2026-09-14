import { waveAudioContainer } from '../container';


import { TYPES } from './symbol';

import type { IRTCPlayerConfig } from '../types/services';
import RenderEngine from '../services/renderingEngines/baseEngine';
import WaveGl from '../services/renderingEngines/webgl-waveform-visualization';


waveAudioContainer.bind<RenderEngine>(TYPES.IRenderEngine).to(RenderEngine);
waveAudioContainer.bind<WaveGl>(TYPES.IWaveGl).to(WaveGl);


function createWaveAudioServiceInstance(config: IRTCPlayerConfig): RenderEngine {
    let playerInstance = waveAudioContainer.get<RenderEngine>(TYPES.IRenderEngine);
    playerInstance.init(config || {});
     return playerInstance;
   }

 export { createWaveAudioServiceInstance };
