
import { injectable, inject, Container, LazyServiceIdentifer } from 'inversify';
import PlayerService from '../index';
class PCMPlayer {
    private audioContext: AudioContext;
    private scriptNode: ScriptProcessorNode;
    private channelCount: number;
    private sampleRate: number;
    private bufferSize: number;
    private samplesQueue: Float32Array[];
    private nextFrameIndex: number;

    constructor(sampleRate: number, channelCount: number, bufferSize: number = 4096) {

    }

    init(sampleRate: number, channelCount: number, bufferSize: number = 4096) {
        this.audioContext = new AudioContext({ sampleRate });
        this.channelCount = channelCount;
        this.sampleRate = sampleRate;
        this.bufferSize = bufferSize;
        this.samplesQueue = [];
        this.nextFrameIndex = 0;

        this.scriptNode = this.audioContext.createScriptProcessor(this.bufferSize, 0, this.channelCount);
        this.scriptNode.onaudioprocess = this.processAudio.bind(this);
        this.scriptNode.connect(this.audioContext.destination);
    }

    private processAudio(audioProcessingEvent: AudioProcessingEvent): void {
        const { outputBuffer } = audioProcessingEvent;

        for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
            const outputData = outputBuffer.getChannelData(channel);

            for (let i = 0; i < outputBuffer.length; i++) {
                if (this.samplesQueue.length > 0 && this.samplesQueue[0].length > this.nextFrameIndex) {
                    outputData[i] = this.samplesQueue[0][this.nextFrameIndex++];
                    if (this.nextFrameIndex >= this.samplesQueue[0].length) {
                        this.samplesQueue.shift();
                        this.nextFrameIndex = 0;
                    }
                } else {
                    outputData[i] = 0; // Fill with silence if no data available
                }
            }
        }
    }

    public feedPcm(pcmData: Float32Array): void {
        this.samplesQueue.push(pcmData);
    }

    public start(): void {
        this.scriptNode.connect(this.audioContext.destination);
    }

    public stop(): void {
        this.scriptNode.disconnect();
        this.samplesQueue = [];
        this.nextFrameIndex = 0;
    }
}

export default PCMPlayer;

// 使用方式
// const pcmPlayer = new PCMPlayer(44100, 2);
// pcmPlayer.start();

// 不断地通过调用 feedPcm 方法插入PCM数据
// pcmPlayer.feedPcm(pcmData);
