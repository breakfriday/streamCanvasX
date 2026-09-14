import { container1, containerPlayer } from '../container';

 import HttpFlvStreamLoader from '../services/stream/fetch_stream_loader';
import { TYPES } from './symbol';

import WebcodecsDecoderService from '../services/decoder/webcodecs';


import PlayerService from '../services/player';

import FLVDemuxService from '../services/demux/flvDemux';

import CanvasVideoService from '../services/video/canvasVideoService';

import DebugLogService from '../services/DebugLogService';

import FLVDemuxStream from '../services/demux/flvDemuxStream';

import AudioProcessingService from '../services/audio/audioContextService';

import type { IplayerConfig, IRTCPlayerConfig } from '../types/services';

import WasmDecoderService from '../services/decoder/wasmDecoder';

import CanvasToVideoSerivce from '../services/muxer/canvasToVideo';

import MseDecoderService from '../services/decoder/mediaSource';
import PreProcessing from '../services/preprocessing';

import RenderEngine from '../services/renderingEngines/baseEngine';
import WaveGl from '../services/renderingEngines/webgl-waveform-visualization';

import RTCPlayerService from '../services/webrtc';
import VideoService from '../services/video/videoService';

// const worker = new Worker(new URL('work.js', import.meta.url));

containerPlayer.bind<PlayerService>(TYPES.IPlayerService).to(PlayerService);
containerPlayer.bind<HttpFlvStreamLoader>(TYPES.IHttpFlvStreamLoader).to(HttpFlvStreamLoader);

containerPlayer.bind<WebcodecsDecoderService>(TYPES.IWebcodecsDecoderService).to(WebcodecsDecoderService);

containerPlayer.bind<FLVDemuxService>(TYPES.IFLVDemuxService).to(FLVDemuxService);

containerPlayer.bind<CanvasVideoService>(TYPES.ICanvasVideoService).to(CanvasVideoService);

containerPlayer.bind<DebugLogService>(TYPES.IDebugLogService).to(DebugLogService);

containerPlayer.bind<AudioProcessingService>(TYPES.IAudioProcessingService).to(AudioProcessingService);
containerPlayer.bind<WasmDecoderService>(TYPES.IWasmDecoderService).to(WasmDecoderService);

containerPlayer.bind<CanvasToVideoSerivce>(TYPES.ICanvasToVideoSerivce).to(CanvasToVideoSerivce);

containerPlayer.bind<MseDecoderService>(TYPES.IMseDecoderService).to(MseDecoderService);

containerPlayer.bind<FLVDemuxStream>(TYPES.IFLVDemuxStream).to(FLVDemuxStream);

containerPlayer.bind<PreProcessing>(TYPES.IPreProcessing).to(PreProcessing);

containerPlayer.bind<RenderEngine>(TYPES.IRenderEngine).to(RenderEngine);
containerPlayer.bind<WaveGl>(TYPES.IWaveGl).to(WaveGl);

containerPlayer.bind<RTCPlayerService>(TYPES.IRTCPlayerService).to(RTCPlayerService);
containerPlayer.bind<VideoService>(TYPES.IVideoService).to(VideoService);

 function createPlayerServiceInstance(config: IplayerConfig): PlayerService {
  let playerInstance = containerPlayer.get<PlayerService>(TYPES.IPlayerService);
  playerInstance.init(config || {});
   return playerInstance;
 }

 export { createPlayerServiceInstance };
