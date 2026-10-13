import type {VideoConfig, VideoSample} from './decoder-types';
import {isSafeVideoRestart} from './video-random-access';

export class EncodedVideoQueueOverflow extends Error {}

export type VideoDecodeCommand = {kind: 'config'; config: VideoConfig} | {kind: 'sample'; sample: VideoSample};

/** Owns compressed input in demux/decode order, including configuration barriers. */
export default class EncodedVideoQueue {
    private commands: VideoDecodeCommand[] = [];
    private bytes = 0;
    private samples = 0;
    private baseConfig: VideoConfig | null = null;

    constructor(private maxSamples = 120, private maxBytes = 16 * 1024 * 1024,
        private maxBufferedMs = 4000) {}

    get size(): number { return this.commands.length; }
    get sampleCount(): number { return this.samples; }
    get byteLength(): number { return this.bytes; }
    get bufferedMs(): number {
        let first: number | undefined;
        let last = 0;
        for (const entry of this.commands) {
            if (entry.kind === 'config') continue;
            first ??= entry.sample.dts;
            last = entry.sample.dts;
        }
        return first === undefined ? 0 : Math.max(0, (last - first) / 1000);
    }

    push(command: VideoDecodeCommand): void {
        if (command.kind === 'sample') {
            if (!Number.isFinite(command.sample.dts) || !Number.isFinite(command.sample.pts)) {
                throw new Error('Invalid encoded video timestamp');
            }
            if (this.samples >= this.maxSamples || this.bytes + command.sample.data.byteLength > this.maxBytes) {
                throw new EncodedVideoQueueOverflow('Encoded video queue exceeded its limit');
            }
        }
        if (this.commands.length >= this.maxSamples + 16) throw new EncodedVideoQueueOverflow('Too many video configuration barriers');
        if (command.kind === 'sample') {
            const first = this.commands.find(entry => entry.kind === 'sample');
            if (first?.kind === 'sample' && (command.sample.dts - first.sample.dts) / 1000 > this.maxBufferedMs) {
                throw new EncodedVideoQueueOverflow('Encoded video queue exceeded its media-time limit');
            }
        }
        this.commands.push(command);
        if (command.kind === 'sample') {
            this.samples++;
            this.bytes += command.sample.data.byteLength;
        }
    }

    peek(): VideoDecodeCommand | undefined { return this.commands[0]; }
    shift(): VideoDecodeCommand | undefined {
        const entry = this.commands.shift();
        if (entry?.kind === 'config') this.baseConfig = entry.config;
        if (entry?.kind === 'sample') {
            this.samples--;
            this.bytes -= entry.sample.data.byteLength;
        }
        return entry;
    }
    /** Retain the latest safe GOP and its exact config, including subsequent config barriers. */
    skipToLatestKeyframe(): number {
        let config = this.baseConfig;
        let firstDTS: number | null = null;
        let target = -1;
        let targetConfig: VideoConfig | null = null;
        for (let i = 0; i < this.commands.length; i++) {
            const entry = this.commands[i];
            if (entry.kind === 'config') { config = entry.config; continue; }
            firstDTS ??= entry.sample.dts;
            if (config && entry.sample.dts - firstDTS >= 500000 && isSafeVideoRestart(entry.sample, config)) {
                target = i; targetConfig = config;
            }
        }
        if (target < 0 || !targetConfig) return 0;
        const dropped = this.commands.slice(0, target).filter(entry => entry.kind === 'sample').length;
        this.commands = [{kind: 'config', config: targetConfig}, ...this.commands.slice(target)];
        this.samples = 0; this.bytes = 0;
        for (const entry of this.commands) if (entry.kind === 'sample') {
            this.samples++; this.bytes += entry.sample.data.byteLength;
        }
        this.baseConfig = null;
        return dropped;
    }

    clear(): void { this.commands = []; this.bytes = 0; this.samples = 0; this.baseConfig = null; }
}
