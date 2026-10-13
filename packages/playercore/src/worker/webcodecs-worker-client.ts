import EventEmitter from 'events';
import type Mpegts from '../../d.ts/mpegts';
import PipelineWorker from './webcodecs-worker-entry.ts?worker&inline';
import type {WorkerCommand, WorkerMode, WorkerResponse} from './webcodecs-worker-protocol';

/** Public new-path facade. Every run gets a dedicated Worker; no MSE fallback. */
export default class WebCodecsWorkerClient implements Mpegts.DecodePipeline {
    private emitter = new EventEmitter();
    private worker: Worker | null = null;
    private sessionId = 0;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private source: Mpegts.MediaDataSource;
    private config: Mpegts.DecodePipelineConfig;
    private currentState: Mpegts.DecodeStream['state'] = 'idle';
    private generation = 0;
    private receivedFrames = 0;

    constructor(source: Mpegts.MediaDataSource, config: Mpegts.DecodePipelineConfig, private mode: WorkerMode) {
        if (config?.webcodec !== true) throw new TypeError('WebCodecs requires webcodec: true');
        if (!source || source.type !== 'flv' || !source.url || source.segments) {
            throw new TypeError('WebCodecs requires a single FLV URL');
        }
        if (config.customLoader || config.customSeekHandler) {
            throw new TypeError('WebCodecs Worker does not accept customLoader/customSeekHandler functions');
        }
        // Snapshot before asynchronous startup. Resolve relative URLs before entering a Blob Worker.
        try {
            this.source = structuredClone({...source, url: new URL(source.url, document.baseURI).href});
            this.config = structuredClone(config);
        } catch (error) {
            throw new TypeError(`WebCodecs source/config must be structured-cloneable: ${String(error)}`);
        }
        // This legacy option has no meaning in the independent Worker-only path.
        delete this.config.enableWorker;
    }

    get state(): Mpegts.DecodeStream['state'] { return this.currentState; }

    updatePresentationState(state: Mpegts.VideoPresentationState): void {
        if (!this.config.presentationFeedback || this.mode !== 'video' || this.state !== 'running') return;
        if (!Number.isInteger(state.queuedFrames) || state.queuedFrames < 0 ||
            !Number.isFinite(state.bufferedAheadMs) || state.bufferedAheadMs < 0 ||
            (state.presentedPTS !== null && !Number.isFinite(state.presentedPTS)) ||
            (state.discardBeforePTS != null && !Number.isFinite(state.discardBeforePTS))) {
            throw new TypeError('Invalid video presentation state');
        }
        this.worker?.postMessage({cmd: 'presentation-state', sessionId: this.sessionId,
            generation: this.generation, receivedFrames: this.receivedFrames, state} satisfies WorkerCommand);
    }

    on<K extends keyof Mpegts.DecodePipelineEventMap>(event: K, listener: (data: Mpegts.DecodePipelineEventMap[K]) => void): this {
        if (this.state === 'destroyed') throw new Error('WebCodecs stream is destroyed');
        this.emitter.on(event, listener);
        return this;
    }

    off<K extends keyof Mpegts.DecodePipelineEventMap>(event: K, listener: (data: Mpegts.DecodePipelineEventMap[K]) => void): this {
        this.emitter.off(event, listener);
        return this;
    }

    start(): void {
        if (this.state === 'destroyed') throw new Error('WebCodecs stream is destroyed');
        if (this.state === 'running') return;
        this.disposeWorker();
        this.currentState = 'running';
        this.generation = 0;
        this.receivedFrames = 0;
        const sessionId = ++this.sessionId;
        try {
            const worker = this.worker = new PipelineWorker({name: `streamcanvasx-${this.mode}`});
            let ready = false;
            const current = () => this.worker === worker && this.sessionId === sessionId;
            const fail = (msg: string) => {
                if (current()) this.fail({type: 'worker', detail: 'WORKER_ERROR', msg});
            };
            this.timer = setTimeout(() => fail('WebCodecs Worker initialization timed out'), 10000);
            worker.onerror = event => { event.preventDefault(); fail(event.message || 'Worker execution failed'); };
            worker.onmessageerror = () => fail('Worker message deserialization failed');
            worker.onmessage = ({data}: MessageEvent<WorkerResponse>) => {
                if (!current()) {
                    if (data.event === 'video_frame') data.data.close();
                    return;
                }
                if (data.event === 'ready') {
                    if (ready) return;
                    ready = true;
                    clearTimeout(this.timer);
                    try {
                        const command: WorkerCommand = {cmd: 'start', sessionId, mode: this.mode,
                            source: this.source, config: this.config};
                        worker.postMessage(command);
                    } catch (error) { fail(String(error)); }
                    return;
                }
                if (data.sessionId !== sessionId) {
                    if (data.event === 'video_frame') data.data.close();
                    return;
                }
                if (data.event === 'error') { this.fail(data.data); return; }
                if (data.event === 'video_reset') {
                    this.generation = data.generation;
                    this.receivedFrames = 0;
                } else if (data.generation !== this.generation) {
                    if (data.event === 'video_frame') data.data.close();
                    return;
                }
                if (data.event === 'video_frame') {
                    this.receivedFrames++;
                    const receivedFrames = this.receivedFrames;
                    const generation = this.generation;
                    // Borrowed for the synchronous event callback. Consumers clone if retaining.
                    try { this.emitter.emit(data.event, data.data); }
                    finally {
                        data.data.close();
                        if (current()) worker.postMessage({cmd: 'frame-released', sessionId,
                            generation, receivedFrames} satisfies WorkerCommand);
                    }
                    return;
                }
                const complete = data.event === 'decode_complete' ||
                    (this.mode === 'samples' && data.event === 'loading_complete');
                if (complete) {
                    this.currentState = 'complete';
                    this.disposeWorker();
                }
                this.emitter.emit(data.event, data.data);
            };
        } catch (error) {
            this.fail({type: 'worker', detail: 'WORKER_INIT_ERROR', msg: String(error)});
        }
    }

    private fail(error: Mpegts.DecodeStreamEventMap['error']): void {
        this.currentState = 'error';
        this.disposeWorker();
        this.emitter.emit('error', error);
    }

    private disposeWorker(): void {
        clearTimeout(this.timer);
        this.timer = null;
        const worker = this.worker;
        this.worker = null;
        // terminate cancels worker-owned IO/decoder tasks; no async stop/start race.
        // Leave onmessage guarded so already queued transferred frames are closed.
        worker?.terminate();
    }

    stop(): void {
        if (this.state === 'destroyed') return;
        this.currentState = 'stopped';
        this.disposeWorker();
    }

    destroy(): void {
        if (this.state === 'destroyed') return;
        this.stop();
        this.currentState = 'destroyed';
        this.emitter.removeAllListeners();
    }
}
