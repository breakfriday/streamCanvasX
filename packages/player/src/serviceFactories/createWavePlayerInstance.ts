import { WavePlayerContainer } from '../container';

import WavePlayerService from '../services/audio/wavePlayer';
import AudioWaveService from '../services/audio/audioWaveService';
import { TYPES } from './symbol';

import type { IWavePlayerConfig } from '../types/services';

WavePlayerContainer.bind<WavePlayerService>(TYPES.IWavePlayerService).to(WavePlayerService);
WavePlayerContainer.bind<AudioWaveService>(TYPES.IAudioWaveService).to(AudioWaveService);

function createWavePlayerServiceInstance(config: IWavePlayerConfig): WavePlayerService {
  let playerInstance = WavePlayerContainer.get<WavePlayerService>(TYPES.IWavePlayerService);
  playerInstance.init(config || {});
   return playerInstance;
 }

export { createWavePlayerServiceInstance };
