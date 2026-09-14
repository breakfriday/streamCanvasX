/** Public API for the browser ESM artifact. Keep this file independent of src/. */
export interface IplayerConfig {
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

export interface PlayerService {
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
