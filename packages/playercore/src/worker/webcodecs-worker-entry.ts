import DecodeStreamController from '../core/decode-stream-controller';
import Events from '../core/decode-stream-events';
import WebCodecsPipeline, {type PipelineSink} from '../core/webcodecs-pipeline';
import type {WorkerCommand, WorkerResponse} from './webcodecs-worker-protocol';
import type Mpegts from '../../d.ts/mpegts';

const scope = self as unknown as DedicatedWorkerGlobalScope;
let run: DecodeStreamController | WebCodecsPipeline | null = null;
let current = 0;
let inFlight = 0;
let frames: VideoFrame[] = [];
let completing = false;
let generation = 0;
let sentFrames = 0;
let receivedFrames = 0;
let feedback = false;
let live = false;
let transportDroppedFrames = 0;
let presentation: Mpegts.VideoPresentationState | null = null;

function notifyPresentation(): void {
    if (run instanceof WebCodecsPipeline) run.presentationChanged();
}

function resetTransport(): void {
    for (const frame of frames) frame.close();
    frames = [];
    inFlight = 0;
    sentFrames = receivedFrames = 0;
    presentation = null;
    transportDroppedFrames = 0;
    completing = false;
}

function send(message: WorkerResponse, transfer: Transferable[] = []): void {
    scope.postMessage(message, transfer);
}

// Bound transport without collapsing every normal network burst to one frame.
// The main-thread renderer schedules presentation using a separate PTS clock.
function sendFrame(frame: VideoFrame): void {
    inFlight++;
    sentFrames++;
    send({event: 'video_frame', data: frame, sessionId: current, generation}, [frame]);
}

function completeIfDrained(): void {
    if (completing && !frames.length && !inFlight) {
        completing = false;
        send({event: 'decode_complete', data: undefined, sessionId: current, generation});
    }
}

scope.onmessage = ({data}: MessageEvent<WorkerCommand>) => {
    if (data.cmd === 'frame-released') {
        if (data.sessionId !== current || data.generation !== generation) return;
        inFlight = Math.max(0, inFlight - 1);
        if (!feedback) receivedFrames = Math.max(receivedFrames, data.receivedFrames);
        if (frames.length) sendFrame(frames.shift()!);
        completeIfDrained();
        notifyPresentation();
        return;
    }
    if (data.cmd === 'presentation-state') {
        if (!feedback || data.sessionId !== current || data.generation !== generation ||
            data.receivedFrames < receivedFrames || data.receivedFrames > sentFrames) return;
        receivedFrames = data.receivedFrames;
        presentation = data.state;
        if (live && presentation.discardBeforePTS != null) {
            const cutoff = presentation.discardBeforePTS;
            frames = frames.filter(frame => {
                if (frame.timestamp >= cutoff) return true;
                frame.close(); transportDroppedFrames++; return false;
            });
        }
        notifyPresentation();
        return;
    }
    run?.destroy();
    resetTransport();
    generation = 0;
    feedback = data.config.presentationFeedback === true;
    live = data.source.isLive === true;
    current = data.sessionId;
    const sessionId = current;
    const emit: PipelineSink = (event, payload) => {
        if (sessionId !== current) {
            if (event === 'video_frame') (payload as VideoFrame).close();
            return;
        }
        if (event === 'video_frame') {
            const frame = payload as VideoFrame;
            if (inFlight < 2) sendFrame(frame);
            else {
                frames.push(frame);
                if (frames.length > 16) { frames.shift()!.close(); transportDroppedFrames++; }
            }
            return;
        }
        if (event === 'video_reset') {
            resetTransport();
            generation++;
        }
        if (event === 'video_buffer_stats') {
            send({event, data: {...payload as Mpegts.VideoBufferStatistics, transportDroppedFrames}, sessionId, generation});
            return;
        }
        if (event === 'decode_complete') {
            completing = true;
            completeIfDrained();
            return;
        }
        const transfer: Transferable[] = [];
        if (event === 'encoded_sample') transfer.push((payload as {data: Uint8Array<ArrayBuffer>}).data.buffer);
        if (event === 'pcm_data') transfer.push((payload as {data: ArrayBuffer}).data);
        if (event === 'error') { for (const frame of frames) frame.close(); frames = []; }
        // event and payload are correlated by PipelineSink; preserve that on the wire.
        send({event, data: payload, sessionId, generation} as WorkerResponse, transfer);
    };
    try {
        if (data.mode === 'video') {
            run = new WebCodecsPipeline(data.source, data.config, emit, () => ({
                retainedFrames: frames.length + Math.max(0, sentFrames - receivedFrames) +
                    (presentation?.queuedFrames ?? 0),
                bufferedAheadMs: presentation?.bufferedAheadMs ?? 0,
                presentedPTS: presentation?.presentedPTS ?? null,
                discardBeforePTS: presentation?.discardBeforePTS ?? null
            }));
        } else {
            const stream = new DecodeStreamController(data.source, data.config);
            for (const event of Object.values(Events)) stream.on(event, value => emit(event, value));
            run = stream;
        }
        run.start();
    } catch (error) {
        run?.destroy();
        emit('error', {type: 'worker', detail: 'WORKER_START_ERROR', msg: String(error)});
    }
};

send({event: 'ready'});
