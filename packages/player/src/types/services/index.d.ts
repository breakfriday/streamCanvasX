import { UseMode, BridgePlayerStreamType } from '../../constant';
export interface IDrawer {
    mediaSource_el?: HTMLAudioElement | HTMLVideoElement;
    canvas?: HTMLCanvasElement;
    audioContext?: AudioContext;
    canvasContext?: CanvasRenderingContext2D;
    analyserNode?: AnalyserNode;
    audioSourceNode?: MediaElementAudioSourceNode;
  }

  export interface IProcess {
    context: IDrawer;
  }

  // 这是音频可视化的 绘图接口
  export interface IWaveDecorator{
    drawAudio1: () => void;


  }


export interface IOriginSerivce {
    logger: IServiceA;


    doSomething: () => void;
  }

export interface IOriginSerivceFactory{
  (Name: string): IOriginSerivce;
}

export interface IServiceA {
    logMessage: (message: string) => void;
  }


export interface IAudioProcessingService{
  context: IProcess['context'];

}


 interface playerParms{
  type: string; isLive: boolean; url: string;
}

interface Iconfig{
  useCanvas: boolean;
  cutCanvas: boolean;
  useWebGpu: boolean;

}

interface IfactoryParms{
  config: Partial<Iconfig>;
  root_el: HTMLElement;
  canvas_el: HTMLCanvasElement;
}


export interface ImainPlayerService{
 createFlvPlayer: (parms: Partial<playerParms>) => void;
 set_blob_url: (filedata: File) => void;
 analyzeCanvas: () => void;
 setConfig: (parms: Partial<Iconfig>) => void;
 factory: (parms: Partial<IfactoryParms>) => void;

}


export interface Idemux{
  isIFrame: boolean;
  IData: {
    ts: number;
    cts?: number;
    payload: Uint8Array;
    type: number;
    isIFrame?: boolean;
  };
}

export interface I_DEFAULT_PLAYER_OPTIONS {
  videoBuffer: number;
  videoBufferDelay: number;
  isResize: boolean;
  isFullResize: boolean;
  isFlv: boolean;
  debug: boolean;
  hotKey: boolean;
  loadingTimeout: number;
  heartTimeout: number;
  timeout: number;
  loadingTimeoutReplay: boolean;
  heartTimeoutReplay: boolean;
  loadingTimeoutReplayTimes: number;
  heartTimeoutReplayTimes: number;
  supportDblclickFullscreen: boolean;
  showBandwidth: boolean;
  keepScreenOn: boolean;
  isNotMute: boolean;
  hasAudio: boolean;
  hasVideo: boolean;
  operateBtns: {
      fullscreen: boolean;
      screenshot: boolean;
      play: boolean;
      audio: boolean;
      record: boolean;
  };
  controlAutoHide: boolean;
  hasControl: boolean;
  loadingText: string;
  background: string;
  decoder: string;
  url: string;
  rotate: number;
  forceNoOffscreen: boolean;
  hiddenAutoPause: boolean;
  protocol: number;
  demuxType: string;
  useWCS: boolean;
  wcsUseVideoRender: boolean;
  useMSE: boolean;
  useOffscreen: boolean;
  autoWasm: boolean;
  wasmDecodeErrorReplay: boolean;
  openWebglAlignment: boolean;
  wasmDecodeAudioSyncVideo: boolean;
  recordType: string;
  useWebFullScreen: boolean;
}


 interface IplayerConfig{
  /** Opt in to the video-only Worker WebCodecs pipeline. Defaults to false (MSE). */
  webcodecs?: boolean;
  videoRenderBackend?: 'webgl' | 'webgpu';
  /** Copy encoded samples for diagnostic counters; disabled by default. */
  webcodecsDebug?: boolean;
  model?: UseMode;
  url?: string;
  rtspUrl?: string;
  useWebworker?: boolean;
  hasVideo?: boolean;
  hasAudio?: boolean;
  hasControl?: boolean;
  contentEl?: HTMLElement;
  showAudio?: boolean;
  errorUrl?: string;
  useOffScreen?: boolean;
  audioDraw?: number;
  renderPerSecond?: number;
  updataBufferPerSecond?: number;
  fftsize?: number;
  bufferSize?: number;
  degree?: number;
  crypto?: {
    enable: boolean;
    key: string;
    useWasm?: boolean;
    wasmModulePath: string;
    wamFunctions?: {
      'encrypt': string;
      'decrypt': string;
    };
  } | null;
  streamType?: string;// 其他可能的值: "PCM", "MP4", "FLV"
  audioPlayback?: {
    'method': string; // "MSE" 或 "AudioContext"
  };
  fileData?: File;
  isLive?: boolean;
  splitAVBuffers?: boolean;
  stopCallBack?: () => Promise<{ message?: string; stop?: boolean }>;
  isMuted?: boolean;

}

interface IRTCPlayerConfig{
  contentEl?: HTMLElement;
  url?: string;
  pushToken?: string;
  fetchToken?: string;
  token?: string;
  renderType?: string;
}

interface IWavePlayerConfig{
  contentEl?: HTMLElement;
  routes?: number;
  isMocking?: boolean;
  renderType?: number;
  arrayLength?: number;
  updateArrayLength?: number;
  width?: number;
  height?: number;
  updateArrayTimes?: number;
  renderTimes?: number;
  duration?: number;
  canvas_el?: HTMLCanvasElement;
  converLiveData?: boolean;
  fftSize?: number;
  mirrorMode?: boolean;
  expandGlBuffer?: number;
}

interface IWavePlayerExtend{
  showid?: boolean;
  showAllid?: boolean;
  terminalid?: Array<string | number>;
  id?: Array<number>;
  style?: CSSStyleDeclaration;
}


interface IBridgePlayerConfig {
  contentEl: HTMLElement;
  frameWidth?: number;
  frameHeight?: number;
  stremType?: BridgePlayerStreamType;
  url?: string;
  renderFps?: number;
  rtspUrl?: string;
  showAudio?: boolean;
  OffscreenCanvasConfig?: {
    creationMethod: string;
  };


}

export type IBridgePlayerConfig = Partial<IBridgePlayerConfig >;

export type IplayerConfig = Partial<IplayerConfig>;


export type IRTCPlayerConfig = Partial<IRTCPlayerConfig>;

export type IWavePlayerConfig = Partial<IWavePlayerConfig>;
export type IWavePlayerExtend = Partial<IWavePlayerExtend>;

export interface PCMBufferItem{
	data?: Float32Array[];
	timestamp?: number; // ms
	duration?: number; // ms
}

export interface IAduioContextPlayerConfig{
  sampleRate?: number;
  bufferSize?: number; // 播放时一个pcm帧中的音频点数
  numberOfOutputChannels?: number;
  useWorklet?: boolean;
  isLive?: boolean;
}