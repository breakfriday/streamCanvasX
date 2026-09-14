
class AudioContextPlayer {
	constructor(preProcessingService) {
		this.audioContext = null;
		this.hasInitScriptNode = false;
		this.hasInitAudioWorkletNode = false;
		this.bufferList = [];
		this.playedBufferCount = 20;
		this.playingIndex = 0;
		this.currentTime = 0;
		this.remainingPCMData = new Float32Array(0);
		this.hasInit = false;
	}

	init(config) {
		const default_config = {
			sampleRate: 8000,
			bufferSize: 256,
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
		this.gainNode.gain.value = 4;
	}
	destroy() {
		this.audioContext = null;
		this.hasInit = false;
		this.hasInitScriptNode = false;
		this.bufferList = [];
		this.playedBufferCount = 0;
		this.playingIndex = 0;
		if (this.scriptNode) {
			this.scriptNode && this.scriptNode.disconnect();
		}
		if (this.audioWorkletNode) {
			this.audioWorkletNode && this.audioWorkletNode.disconnect();
		}
		this.gainNode && this.gainNode.disconnect();
		this.audioContext.close();
	}


	feedPCMDataBeta(pcmData) { // 单声道
		if (pcmData.length === 0) {
			return false; // 如果 PCM 数据为空，直接返回
		}

		const { bufferSize } = this.config;

		// 合并剩余的 PCM 数据和当前的 PCM 数据
		let allPCMData = new Float32Array(this.remainingPCMData.length + pcmData.length);
		allPCMData.set(this.remainingPCMData, 0); // 先把剩余数据填充到新的数组
		allPCMData.set(pcmData, this.remainingPCMData.length); // 然后把当前数据接上

		// 计算可以填充的缓冲区数量
		let count = Math.floor(allPCMData.length / bufferSize);

		// 处理数据并填充缓冲区
		for (let i = 0; i < count; i++) {
			let bufferItem = {
				data: [allPCMData.slice(i * bufferSize, (i + 1) * bufferSize)], // 每个缓冲区的数据
			};
			this.bufferList.push(bufferItem);
			if (this.bufferList.length > this.playedBufferCount) {
				this.bufferList.shift(); // 如果缓冲区超出了最大值，移除最旧的缓冲区
			}
		}

		// 更新 remainingPCMData，确保剩余未处理的部分
		let remainingDataLength = allPCMData.length - count * bufferSize;
		if (remainingDataLength > 0) {
			this.remainingPCMData = allPCMData.slice(count * bufferSize); // 剩余的数据
		} else {
			this.remainingPCMData = new Float32Array(0); // 清空剩余数据

			return false;
		}
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

				// 如果没有数据可以播放，就直接清空输出缓冲区
				if (this.bufferList.length === 0) {
					// 清空每个通道的输出数据，防止回音
					this.remainingPCMData = new Float32Array(0);
					for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
						const nowBuffering = outputBuffer.getChannelData(channel);
						nowBuffering.fill(0); // 填充0，清空输出缓冲区
					}
					return; // 如果没有数据，直接返回，不进行后续处理
				}
				if (this.bufferList.length) {
					const bufferItem = this.bufferList.shift();

					for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
						const nowBuffering = outputBuffer.getChannelData(channel);
						nowBuffering.set(bufferItem.data[channel]);
					}
				}
			};
		}

		this.scriptNode = scriptNode;
		this.scriptNode.connect(this.gainNode);
		this.gainNode.connect(this.audioContext.destination);
		this.hasInitScriptNode = true;
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
