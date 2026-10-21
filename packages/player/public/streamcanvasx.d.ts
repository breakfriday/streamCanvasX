/** Public API for the browser ESM artifact. Keep this file independent of src/. */
export interface IplayerConfig {
  /** Opt in to the video-only Worker WebCodecs pipeline. Defaults to false (MSE). */
  webcodecs?: boolean;
  videoRenderBackend?: 'webgl' | 'webgpu';
  /** Copy encoded samples for diagnostic counters; disabled by default. */
  webcodecsDebug?: boolean;
  model?: unknown;
  url?: string;
  rtspUrl?: string;
  hasVideo?: boolean;
  hasAudio?: boolean;
  hasControl?: boolean;
  contentEl?: HTMLElement;
  showAudio?: boolean;
  errorUrl?: string;
  useOffScreen?: boolean;
  streamType?: string;
  fileData?: File;
  isLive?: boolean;
  isMuted?: boolean;
  [key: string]: unknown;
}

export interface IRTCPlayerConfig {
  contentEl?: HTMLElement;
  url?: string;
  pushToken?: string;
  fetchToken?: string;
  token?: string;
  renderType?: string;
}

export interface IWavePlayerConfig {
  contentEl?: HTMLElement;
  canvas_el?: HTMLCanvasElement;
  [key: string]: unknown;
}

export interface IWavePlayerExtend {
  [key: string]: unknown;
}

export interface IBridgePlayerConfig extends IplayerConfig {
  contentEl?: HTMLElement;
}

export interface WebCodecsStatistics {
  counts: {video: number; audio: number; pcm: number; decoded: number; rendered: number};
  firstFrameMs?: number;
  rendering?: {
    queuedFrames: number; bufferedMs: number; droppedFrames: number; renderFps: number;
    bufferedAheadMs: number; state: 'buffering' | 'playing' | 'rebuffering' | 'ended';
    rebufferCount: number; playbackRate: number; liveLatencyMs: number | null; fastCatchUps: number;
  };
  buffer?: {
    encodedFrames: number; encodedBytes: number; encodedBufferedMs: number; decodeQueueSize: number;
    pendingDecodeFrames: number; retainedVideoFrames: number; transportDroppedFrames: number;
    decodeDiscardedFrames: number; liveEdgePTS: number | null; encodedSkippedFrames: number;
    keyframeJumps: number; waitingForKeyframe: boolean;
  };
}

export interface PlayerService {
  readonly webcodecsStatistics?: WebCodecsStatistics;
  on(name: 'webcodecsStatus', listener: (message: string) => void): this;
  on(name: 'webcodecsRender', listener: (data: {backend: 'webgl' | 'webgpu'; reason?: string}) => void): this;
  on(name: 'webcodecsError', listener: (error: Error) => void): this;
  on(name: 'webcodecsReconnect', listener: (data: {attempt: number; delayMs: number; reason: string}) => void): this;
  on(name: 'webcodecsStarted', listener: () => void): this;
  on(name: 'webcodecsComplete', listener: (statistics: WebCodecsStatistics) => void): this;
  on(name: string, listener: (...args: any[]) => void): this;
  off(name?: string, listener?: (...args: any[]) => void): this | undefined;
  createPlayer(params: { type?: string; isLive?: boolean; url?: string }): void;
  destroy(): void;
  [key: string]: unknown;
}

export interface WaveVisualizationService {
  destroy?: () => void;
  [key: string]: unknown;
}

export class MseDecoder {
  [key: string]: unknown;
}

export class Scheduler {
  constructor(concurrentLimit: number);
  addTask(task: () => Promise<unknown>): void;
  getQueue(): Array<() => Promise<unknown>>;
  clearQueue(): void;
  addAudioTask(audio: HTMLAudioElement): void;
}

export const streamcanvasCore: unknown;
export function createPlayerServiceInstance(config: IplayerConfig): PlayerService;
export function createPlayerServicePromise(config: IplayerConfig): Promise<PlayerService>;
export function createStreamBridgePlayerInstance(config: IBridgePlayerConfig): PlayerService;
export function createWaveVisualizationInstance(config: IWavePlayerConfig, extend?: IWavePlayerExtend): WaveVisualizationService;
export function createWaveVisualizationPromise(config: IWavePlayerConfig, extend?: IWavePlayerExtend): Promise<WaveVisualizationService>;
