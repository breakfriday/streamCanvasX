import type mpegts from '@break_happy/streamcanvasx-core';

type PCMPlaybackParameters = Pick<mpegts.PCMInfo, 'sampleRate' | 'channelCount'>;

interface AudioContextPlayerConfig extends Partial<PCMPlaybackParameters> {
    /** Legacy alias for channelCount. */
    numberOfOutputChannels?: PCMPlaybackParameters['channelCount'];
    gainValue?: number;
    fftSize?: number;
    bufferSize?: number;
    updataBufferPerSecond?: number;
}

type ResolvedAudioConfig = Required<Omit<AudioContextPlayerConfig, 'numberOfOutputChannels'>>;

// Keep the processor self-contained so Vite can bundle it without a separate asset.
const workletCode = `
class PCMProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.reset(sampleRate, 1);
        this.port.onmessage = ({data}) => this.enqueue(data);
    }

    reset(inputRate, channelCount) {
        this.inputRate = inputRate;
        this.channelCount = channelCount;
        this.chunks = [];
        this.offset = 0;
        this.totalFrames = 0;
        this.partial = new Float32Array(0);
    }

    enqueue({pcm, sampleRate: inputRate, channelCount}) {
        // Samples are output directly, so the packet must match the context rate.
        if (inputRate !== sampleRate) return;
        if (inputRate !== this.inputRate || channelCount !== this.channelCount) {
            this.reset(inputRate, channelCount);
        }
        // A stereo frame may span two network packets. Preserve its channel order.
        if (this.partial.length) {
            const joined = new Float32Array(this.partial.length + pcm.length);
            joined.set(this.partial);
            joined.set(pcm, this.partial.length);
            pcm = joined;
        }
        const length = pcm.length - pcm.length % channelCount;
        this.partial = pcm.slice(length);
        if (length) {
            this.chunks.push(pcm.subarray(0, length));
            this.totalFrames += length / channelCount;
        }
        // Bound latency in seconds of input audio, regardless of channel count.
        const excess = this.totalFrames - inputRate * 2;
        if (excess > 0) {
            this.consume(excess);
        }
    }

    consume(count) {
        this.totalFrames -= count;
        while (count > 0) {
            const remaining = this.chunks[0].length / this.channelCount - this.offset;
            const used = Math.min(count, remaining);
            this.offset += used;
            count -= used;
            if (used === remaining) {
                this.chunks.shift();
                this.offset = 0;
            }
        }
    }

    process(inputs, outputs) {
        const output = outputs[0];
        if (!output.length) return true;
        let written = 0;
        while (this.totalFrames > 0 && written < output[0].length) {
            const chunk = this.chunks[0];
            const frames = Math.min(
                chunk.length / this.channelCount - this.offset,
                output[0].length - written
            );
            for (let channel = 0; channel < output.length; channel++) {
                const sourceChannel = this.channelCount === 1 ? 0 : channel;
                for (let i = 0; i < frames; i++) {
                    output[channel][written + i] = chunk[(this.offset + i) * this.channelCount + sourceChannel];
                }
            }
            this.consume(frames);
            written += frames;
        }
        // The unfilled portion of the output remains silent.
        return true;
    }
}
registerProcessor('pcm-processor', PCMProcessor);
`;

class AudioContextPlayer {
    audioContext: AudioContext | null = null;
    workletNode: AudioWorkletNode | null = null;
    gainNode: GainNode | null = null;
    analyserNode: AnalyserNode | null = null;
    hasInit = false;
    destroyed = false;
    workletUrl: string | null = null;
    muted = false;
    initPromise: Promise<void> | null = null;
    config!: ResolvedAudioConfig;
    bufferLength!: number;
    bufferDataLength!: number;
    dataArray!: Float32Array<ArrayBuffer>;
    bufferData!: Float32Array<ArrayBuffer>;
    timeId?: ReturnType<typeof setTimeout>;
    clear?: boolean;

    init(config: AudioContextPlayerConfig = {}): Promise<void> {
        if (this.destroyed) return Promise.reject(new Error('PCM player has been destroyed'));
        if (this.initPromise) return this.initPromise;
        this.config = {
            sampleRate: config.sampleRate ?? 8000,
            channelCount: config.channelCount ?? config.numberOfOutputChannels ?? 1,
            gainValue: config.gainValue ?? 1,
            fftSize: config.fftSize ?? 128,
            bufferSize: config.bufferSize ?? 2.5,
            updataBufferPerSecond: config.updataBufferPerSecond ?? 30,
        };
        this.initPromise = this.initAudioContext().catch(async error => {
            await this.destroy();
            throw error;
        });
        return this.initPromise;
    }

    async initAudioContext(): Promise<void> {
        // Use the actual PCM rate; the Worklet only splits channels, without resampling.
        const context = this.audioContext = new AudioContext({sampleRate: this.config.sampleRate});
        this.gainNode = context.createGain();
        this.gainNode.gain.value = this.muted ? 0 : this.config.gainValue;
        this.gainNode.connect(context.destination);
        this.analyserNode = context.createAnalyser();
        this.analyserNode.fftSize = this.config.fftSize;
        this.analyserNode.connect(this.gainNode);
        this.bufferLength = this.analyserNode.frequencyBinCount;
        this.dataArray = new Float32Array(this.analyserNode.fftSize);
        this.setBufferData();

        const url = this.workletUrl = URL.createObjectURL(new Blob([workletCode], {type: 'application/javascript'}));
        try {
            await context.audioWorklet.addModule(url);
            if (this.destroyed) return;
            this.workletNode = new AudioWorkletNode(context, 'pcm-processor', {
                numberOfInputs: 0,
                numberOfOutputs: 1,
                outputChannelCount: [2],
            });
            this.workletNode.connect(this.analyserNode);
            this.hasInit = true;
        } finally {
            URL.revokeObjectURL(url);
            if (this.workletUrl === url) this.workletUrl = null;
        }
    }

    getWaveformHistory(): Float32Array<ArrayBuffer> {
        return this.bufferData;
    }

    setBufferData(): void {
        this.bufferDataLength = Math.ceil(this.config.bufferSize * this.audioContext!.sampleRate / this.dataArray.length) * this.dataArray.length;
        this.bufferData = new Float32Array(this.bufferDataLength);
    }

    updatBufferData(): void {
        clearTimeout(this.timeId);
        if (this.destroyed || this.clear === true || !this.analyserNode) return;
        this.analyserNode.getFloatTimeDomainData(this.dataArray);
        this.bufferData.copyWithin(0, this.dataArray.length);
        this.bufferData.set(this.dataArray, this.bufferDataLength - this.dataArray.length);
        this.timeId = setTimeout(() => this.updatBufferData(), this.config.updataBufferPerSecond);
    }

    // Public core event bytes are signed 16-bit little-endian, interleaved PCM.
    feedPCMData(buffer: ArrayBuffer, info: mpegts.PCMInfo): boolean {
        // Live playback starts with new packets once the Worklet is ready.
        if (!this.hasInit || !this.workletNode) return false;
        if (info?.format !== 's16le' || buffer.byteLength % 2 !== 0) {
            throw new Error('Expected s16le PCM with complete 16-bit samples');
        }
        const view = new DataView(buffer);
        const pcm = new Float32Array(buffer.byteLength / 2);
        for (let i = 0; i < pcm.length; i++) pcm[i] = view.getInt16(i * 2, true) / 32768;
        return this.feedPCMDataBeta(pcm, info);
    }

    // Preserve the Float32 API for existing callers. Samples remain interleaved.
    feedPCMDataBeta(pcm: Float32Array, info: PCMPlaybackParameters = this.config): boolean {
        if (!this.hasInit || !this.workletNode) return false;
        const {sampleRate, channelCount} = info;
        if (![8000, 16000].includes(sampleRate) || ![1, 2].includes(channelCount)) {
            throw new Error('PCM requires 8000/16000 Hz and one or two channels');
        }
        if (sampleRate !== this.audioContext?.sampleRate) {
            throw new Error('PCM sample rate must match AudioContext; recreate the player for a new rate');
        }
        if (!(pcm instanceof Float32Array) || !pcm.length) return false;
        // Keep caller-owned Float32 buffers usable after posting.
        this.workletNode.port.postMessage({pcm, sampleRate, channelCount});
        return true;
    }

    play(): Promise<void> | undefined {
        return this.audioContext?.resume();
    }

    pause(): Promise<void> | undefined {
        return this.audioContext?.suspend();
    }

    mute(isMuted = false): void {
        this.muted = !!isMuted;
        if (this.gainNode) this.gainNode.gain.value = this.muted ? 0 : this.config.gainValue;
    }

    async destroy(): Promise<void> {
        if (this.destroyed) return;
        this.destroyed = true;
        this.hasInit = false;
        clearTimeout(this.timeId);
        if (this.workletNode) {
            this.workletNode.disconnect();
            this.workletNode.port.close();
            this.workletNode = null;
        }
        this.analyserNode?.disconnect();
        this.gainNode?.disconnect();
        this.analyserNode = null;
        this.gainNode = null;
        const context = this.audioContext;
        this.audioContext = null;
        if (this.workletUrl) URL.revokeObjectURL(this.workletUrl);
        this.workletUrl = null;
        if (context && context.state !== 'closed') await context.close();
    }
}

export default AudioContextPlayer;
