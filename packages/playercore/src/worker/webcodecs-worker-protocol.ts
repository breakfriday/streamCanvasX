import type Mpegts from '../../d.ts/mpegts';

export type WorkerMode = 'samples' | 'video';
export type WorkerCommand =
    | {cmd: 'start'; sessionId: number; mode: WorkerMode; source: Mpegts.MediaDataSource; config: Mpegts.DecodePipelineConfig}
    | {cmd: 'frame-released'; sessionId: number; generation: number; receivedFrames: number}
    | {cmd: 'presentation-state'; sessionId: number; generation: number; receivedFrames: number;
        state: Mpegts.VideoPresentationState};

export type WorkerEvent = {
    [K in keyof Mpegts.DecodePipelineEventMap]: {
        event: K; data: Mpegts.DecodePipelineEventMap[K]; sessionId: number; generation: number;
    }
}[keyof Mpegts.DecodePipelineEventMap];

export type WorkerResponse = {event: 'ready'} | WorkerEvent;
