import { WebRTCInjectionContainer } from '../container';

import RTCPlayerService from '../services/webrtc';
import { TYPES } from './symbol';

import type { IRTCPlayerConfig } from '../types/services';
import VideoService from '../services/video/videoService';

WebRTCInjectionContainer.bind<RTCPlayerService>(TYPES.IRTCPlayerService).to(RTCPlayerService);
WebRTCInjectionContainer.bind<VideoService>(TYPES.IVideoService).to(VideoService);

function createRTCPlayerServiceInstance(config: IRTCPlayerConfig): RTCPlayerService {
    let playerInstance = WebRTCInjectionContainer.get<RTCPlayerService>(TYPES.IRTCPlayerService);
    playerInstance.init(config || {});
     return playerInstance;
   }

 export { createRTCPlayerServiceInstance };
