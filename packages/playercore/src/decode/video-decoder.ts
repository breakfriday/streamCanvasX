import type {VideoConfig, VideoSample, VideoDecoderCallbacks} from './decoder-types';

/** No DOM or worker messaging. Commands retain demux order across async configure. */
export default class WebCodecsVideoDecoder {
    private decoder: VideoDecoder;
    private pending = Promise.resolve();
    private closed = false;
    private configId = 0;
    private needsKey = true;
    private queued = 0;
    private queuedBytes = 0;
    private wake: (() => void) | null = null;

    constructor(private callbacks: VideoDecoderCallbacks) {
        if (typeof VideoDecoder === 'undefined') throw new Error('VideoDecoder is unavailable in this Worker');
        this.decoder = new VideoDecoder({
            output: frame => {
                if (this.closed) frame.close();
                else this.callbacks.onFrame(frame);
            },
            error: error => this.fail(error)
        });
        this.decoder.addEventListener('dequeue', () => { this.wake?.(); this.callbacks.onDequeue?.(); });
    }

    private fail(error: unknown): void {
        if (this.closed) return;
        this.destroy();
        this.callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }

    get decodeQueueSize(): number { return this.decoder.decodeQueueSize; }

    private enqueue(action: () => Promise<void>, bytes = 0): Promise<void> {
        if (this.closed) return Promise.resolve();
        // Bound both async configuration buffering and native submission pressure.
        // Fail explicitly instead of dropping reference frames and corrupting decoding.
        if (this.queued >= 120 || this.queuedBytes + bytes > 16 * 1024 * 1024) {
            this.fail(new Error('Video decode input queue exceeded its limit'));
            return Promise.resolve();
        }
        this.queued++;
        this.queuedBytes += bytes;
        this.pending = this.pending.then(async () => {
            try { if (!this.closed) await action(); }
            finally { this.queued--; this.queuedBytes -= bytes; }
        }).catch(error => this.fail(error));
        return this.pending;
    }

    configure(metadata: VideoConfig): Promise<void> {
        const config: VideoDecoderConfig = {
            codec: metadata.codec,
            description: new Uint8Array(metadata.description),
            codedWidth: metadata.codedWidth,
            codedHeight: metadata.codedHeight,
            displayAspectWidth: metadata.displayWidth,
            displayAspectHeight: metadata.displayHeight,
            optimizeForLatency: true
        };
        return this.enqueue(async () => {
            const support = await VideoDecoder.isConfigSupported(config);
            if (this.closed) return;
            if (!support.supported) throw new Error(`Unsupported video codec configuration: ${metadata.codec}`);
            if (this.decoder.state === 'configured') await this.decoder.flush();
            if (this.closed) return;
            this.decoder.configure(config);
            this.configId = metadata.configId;
            this.needsKey = true;
        });
    }

    decode(sample: VideoSample): Promise<void> {
        return this.enqueue(async () => {
            if (sample.configId !== this.configId) throw new Error('Video sample/configuration mismatch');
            if (this.needsKey && !sample.isKeyframe) return;
            while (!this.closed && this.decoder.decodeQueueSize >= 8) {
                await new Promise<void>(resolve => { this.wake = resolve; });
                this.wake = null;
            }
            if (this.closed) return;
            this.decoder.decode(new EncodedVideoChunk({
                type: sample.isKeyframe ? 'key' : 'delta',
                timestamp: sample.pts,
                data: sample.data as Uint8Array<ArrayBuffer>
            }));
            this.needsKey = false;
        }, sample.data.byteLength);
    }

    async finish(): Promise<void> {
        await this.pending;
        if (!this.closed && this.decoder.state === 'configured') await this.decoder.flush();
    }

    destroy(): void {
        if (this.closed) return;
        this.closed = true;
        this.wake?.();
        if (this.decoder.state !== 'closed') this.decoder.close();
    }
}
