import { injectable, inject, Container, LazyServiceIdentifer } from 'inversify';

import WebcodecsAudioDecoder from '../decoder/audioDecoder';

@injectable()
class AudioContextPlayer {
	webcodecsAudioDecoder: WebcodecsAudioDecoder;
	audioContext: AudioContext;
	audioSource: AudioBufferSourceNode;
	scriptNode: ScriptProcessorNode;
	hasInitScriptNode: boolean;
	bufferList;
	count: number;
	// context: {
	// 	audioContext?: AudioContext;
	// 	// analyserNode?: AnalyserNode;
	// 	gainNode?: GainNode;
	// 	audioSourceNode?: MediaElementAudioSourceNode;
	// 	// mediaSource_el?: HTMLAudioElement | HTMLVideoElement;
	// };
	constructor() {
		this.audioContext = null;
		this.count = 0;
		this.hasInitScriptNode = false;
		this.bufferList = [];
	}

	init(webcodecsAudioDecoder?) {
		if (!webcodecsAudioDecoder) {
			this.webcodecsAudioDecoder = new WebcodecsAudioDecoder();
		}
	}
	destroy() {
		this.audioContext = null;
		if (this.audioSource) {
			this.audioSource && this.audioSource.disconnect();
		}
		if (this.scriptNode) {
			this.scriptNode && this.scriptNode.disconnect();
		}
	}
	audioContextPlayer(frames) {
		for (let i in frames) {
			const audiochunk = new EncodedAudioChunk({
				type: 'key',
				timestamp: frames[i].totalSamples,
				duration: 1 / 32000 * frames[i].data.length / 4 * 1000,
				data: new Uint8Array(frames[i].data),
			});

		this.webcodecsAudioDecoder.decode(audiochunk);
		}
	}
	audioContextScriptProcessor(audioData: AudioData, audioBuffer: ArrayBuffer) {
		if (!this.audioContext) {
			this.audioContext = new AudioContext({
				// sampleRate: 32000,
				sampleRate: audioData.sampleRate,
			});
		}
		this.audioSource = this.audioContext.createBufferSource();
		const buffer = this.audioContext.createBuffer(
			audioData.numberOfChannels,		// 1	 number of channels
			audioData.numberOfFrames, // 1024  frameCount
			this.audioContext.sampleRate, //  audioContext.sampleRate
		);
		let Float32Array_audioBuffer = new Float32Array(audioBuffer);
		this.bufferList.push(Float32Array_audioBuffer);
		let nowBuffering = buffer.getChannelData(0);
		for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
			for (let i = 0; i < audioData.numberOfFrames; i++) {
				nowBuffering[i] = Float32Array_audioBuffer[i] || 0;
			}
		}
		if (this.count === 0) {
			this.audioSource.buffer = buffer;
			this.audioSource.connect(this.audioContext.destination);

			this.count = this.count + 1;

			this.audioSource.start();
		}
		this.initScriptNode();
	}
	initScriptNode() {
		if (this.hasInitScriptNode) {
				return;
		}
		// debugger;
		const scriptNode = this.audioContext.createScriptProcessor(1024, 0, this.audioSource.buffer.numberOfChannels);
		// tips: if audio isStateSuspended  onaudioprocess method not working
		scriptNode.onaudioprocess = (audioProcessingEvent) => {
				const { outputBuffer } = audioProcessingEvent;

				if (this.bufferList.length) {
						if (this.bufferList.length === 0) {
								return;
						}
						const bufferItem = this.bufferList.shift();

						// update audio time stamp
						// if (bufferItem && bufferItem.ts) {
						// 		this.player.audioTimestamp = bufferItem.ts;
						// }

						for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
								const nowBuffering = outputBuffer.getChannelData(channel);
								for (let i = 0; i < 1024; i++) {
										nowBuffering[i] = bufferItem[i] || 0;
								}
						}
				}
		};

		this.scriptNode = scriptNode;
		this.scriptNode.connect(this.audioContext.destination);
		this.hasInitScriptNode = true;
	}
}

export default AudioContextPlayer;