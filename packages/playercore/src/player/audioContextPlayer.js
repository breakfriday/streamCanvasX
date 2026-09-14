
class AudioContextPlayer  {


	constructor(preProcessingService) {
		this.audioContext = null;
		this.hasInitScriptNode = false;
		this.hasInitAudioWorkletNode = false;
		this.bufferList = [];
		this.playedBufferCount = 1000;
		this.playingIndex = 0;
		this.currentTime = 0;
		this.remainingPCMData = new Float32Array(0);
		this.hasInit = false;
	}

	init(config) {
		const default_config = {
			sampleRate: 8000,
			bufferSize: 1024,
			numberOfOutputChannels: 1,
			isLive: true,
		};
		this.config = Object.assign(default_config, config);
		const { useWorklet, isLive } = this.config;
		this.isLive = isLive;
		this.initAudioContext();

		this.initScriptNode();

		this.hasInit = true;
	}
	initAudioContext() {
		if (!this.audioContext) {
			this.audioContext = new AudioContext({
				sampleRate: this.config.sampleRate,
			});
		}
		this.gainNode = this.audioContext.createGain();
		this.gainNode.gain.value=5
		
	}
	destroy() {
		this.audioContext = null;
		this.hasInit = false;
		this.hasInitScriptNode = false;
		this.bufferList = [];
		this.playedBufferCount = 1000;
		this.playingIndex = 0;
		if (this.scriptNode) {
			this.scriptNode && this.scriptNode.disconnect();
		}
		if (this.audioWorkletNode) {
			this.audioWorkletNode && this.audioWorkletNode.disconnect();
		}
		this.gainNode && this.gainNode.disconnect();
	}


	// feedPCMData(pcmData: Float32Array) {
	// 	const { bufferSize, numberOfOutputChannels } = this.config;
	// 	let allPCMData = new Float32Array((this.remainingPCMData.length + pcmData.length));
	// 	allPCMData.set(this.remainingPCMData, 0);
	// 	allPCMData.set(pcmData, this.remainingPCMData.length);
	// 	let count = Math.floor(allPCMData.length / (bufferSize * numberOfOutputChannels));

	// 	for (let i = 0; i < count; i++) {
	// 		let bufferItem: PCMBufferItem = {
	// 			data: [],
	// 		};

	// 		for (let outputChannel = 0; outputChannel < numberOfOutputChannels; outputChannel++) {
	// 			bufferItem.data.push(new Float32Array(bufferSize));
	// 		}

	// 		for (let index = 0; index < bufferSize; index++) {
	// 			for (let outputChannel = 0; outputChannel < numberOfOutputChannels; outputChannel++) {
	// 				bufferItem.data[outputChannel][index] = allPCMData[outputChannel + index * numberOfOutputChannels + i * (bufferSize * numberOfOutputChannels)];
	// 			}
	// 		}
	// 		this.bufferList.push(bufferItem);
	// 	}
	// 	this.remainingPCMData = allPCMData.slice(count * bufferSize * numberOfOutputChannels);
	// }
	feedPCMDataBeta(pcmData) { // 单声道
		const { bufferSize } = this.config;
		let allPCMData = new Float32Array((this.remainingPCMData.length + pcmData.length));
		allPCMData.set(this.remainingPCMData, 0);
		allPCMData.set(pcmData, this.remainingPCMData.length);
		let count = Math.floor(allPCMData.length / bufferSize);
		for (let i = 0; i < count; i++) {
			let bufferItem = {
				data: [allPCMData.slice(i * bufferSize, (i + 1) * bufferSize)],
			};
			this.bufferList.push(bufferItem);
		}
		this.remainingPCMData = allPCMData.slice(count * bufferSize);
	
	}
	initScriptNode() {
		if (this.hasInitScriptNode) {
				return;
		}
		// debugger;
		const { bufferSize, numberOfOutputChannels } = this.config;
		const scriptNode = this.audioContext.createScriptProcessor(bufferSize, 0, numberOfOutputChannels); // bufferSize  numberOfOutputChannels
		if (this.isLive) { // 在线播放
			scriptNode.onaudioprocess = (audioProcessingEvent) => {
				const { outputBuffer } = audioProcessingEvent;
				if (this.bufferList.length) {
					const bufferItem = this.bufferList.shift();

					for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
						const nowBuffering = outputBuffer.getChannelData(channel);
						nowBuffering.set(bufferItem.data[channel]);
					}
				} else if (this.replayCounts > 0) {
					this.replayCounts--;
					this.feedPCMData(this.replayPCMData);
				}
			};
		} 

		this.scriptNode = scriptNode;
		this.scriptNode.connect(this.gainNode);
		this.gainNode.connect(this.audioContext.destination);
		this.hasInitScriptNode = true;
	}
	
	updateCurrentTime(currentTime) { // ms
		let second = currentTime / 1000;
		this.currentTime = second;
		let buffered = this.buffered();
		this.emit('audioInfo', { second, buffered });
	}
	isBuffered(second) {
		let ms = second * 1000;
		let index = this.bufferList.findIndex(item => {
			return ms >= item.timestamp && ms <= item.timestamp + item.duration;
		});
		return index !== -1;
	}
	buffered() {
		if (this.bufferList && this.bufferList.length) {
			let { length } = this.bufferList;
			return { start: this.bufferList[0].timestamp / 1000, end: (this.bufferList[length - 1].timestamp + this.bufferList[length - 1].duration) / 1000 }; // s
		}
	}
	bufferedIndex(second) {
		let ms = second * 1000;
		let index = this.bufferList.findIndex(item => {
			return ms >= item.timestamp && ms <= item.timestamp + item.duration;
		});
		return index;
	}

	play() {
		if (this.audioContext.state === 'suspended') {
			this.audioContext.resume();
		}
	}
	pause() {
		if (this.audioContext.state === 'running') {
			this.audioContext.suspend();
		}
	}
	mute(parm) {
		if (parm === true) {
			this.gainNode.disconnect();
		} else {
			this.gainNode.connect(this.audioContext.destination);
		}
	}
}

export default AudioContextPlayer;
