import { streamBridgeContainer } from '../container';


import PlayerService from '../services/steamBridgePlayer';
import type { IBridgePlayerConfig } from '../types/services';
import { TYPES } from './symbol';
import StreamBridgePlayer from '../services/steamBridgePlayer';
import MediaRenderEngine from '../services/steamBridgePlayer/render';
import StreamIo from '../services/steamBridgePlayer/streamIo';
import AudioPlayer from '../services/steamBridgePlayer/audio';

streamBridgeContainer.bind<StreamBridgePlayer>(TYPES.IStreamBridePlayer).to(StreamBridgePlayer);
streamBridgeContainer.bind<MediaRenderEngine>(TYPES.IMediaRenderEngine).to(MediaRenderEngine);
streamBridgeContainer.bind<StreamIo>(TYPES.IStreamIo).to(StreamIo);
streamBridgeContainer.bind<AudioPlayer>(TYPES.IAudioPlayer).to(AudioPlayer);


function createStreamBridgePlayerInstance(config: IBridgePlayerConfig): PlayerService {
  let playerInstance = streamBridgeContainer.get<PlayerService>(TYPES.IStreamBridePlayer);
  playerInstance.init(config);
   return playerInstance;
 }

 export { createStreamBridgePlayerInstance };
