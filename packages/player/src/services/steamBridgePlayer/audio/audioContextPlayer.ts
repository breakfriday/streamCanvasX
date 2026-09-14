import { injectable, inject, Container, LazyServiceIdentifer } from 'inversify';
import Emitter from '../../../utils/emitter';
import PlayerService from '../index';

import type { PCMBufferItem, IAduioContextPlayerConfig } from '../../../types/services';

// import worklet from './audioWorklet.js';

let analyseAudioConfig={
	updataBufferPerSecond: 15,
	renderPerSecond: 15,
	fftsize: 128,
	bufferSize: 0.2
};
@injectable()
class AudioContextPlayer extends Emitter {
	config: IAduioContextPlayerConfig;
	hasInit: boolean;
	audioContext: AudioContext;
	scriptNode: ScriptProcessorNode;
	audioWorkletNode: AudioWorkletNode;
	gainNode: GainNode;
	hasInitScriptNode: boolean;
	hasInitAudioWorkletNode: boolean;
	bufferList: PCMBufferItem[];
	playedBufferCount: number;
	playingIndex: number;
	currentTime: number;
	remainingPCMData: Float32Array;
	isLive: boolean;
	replayCounts: number;
	replayPCMData: Float32Array;
	playersevice: PlayerService;
	canvas_el: HTMLCanvasElement;
	canvas_context: CanvasRenderingContext2D;
	clear?: boolean;
	resizeObserver: ResizeObserver;
	analyserNode: AnalyserNode;
	bufferData: Float32Array;
	dataArray: Float32Array;
	bufferDataLength: number;
	timeId?: NodeJS.Timeout
	constructor() {
		super();

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

	init(config?: IAduioContextPlayerConfig,playerService?: PlayerService) {
		this.playersevice=playerService;
		const default_config = {
			sampleRate: 32000,
			bufferSize: 1024,
			numberOfOutputChannels: 1,
			isLive: true,
			// sampleRate: 44100,
		};
		this.config = Object.assign(default_config, config);


		const { useWorklet, isLive } = this.config;
		this.isLive = isLive;
		this.initAudioContext();

		this.initScriptNode();
		this.hasInit = true;
		this.initCanvas();
	}

	initCanvas() {
		let { contentEl } =this.playersevice.config;


		this.canvas_el = document.createElement('canvas');
		this.canvas_el.style.position = 'absolute';
		this.canvas_el.setAttribute('name', 'audioCanvas');
		this.canvas_context=this.canvas_el.getContext("2d");
		contentEl.append(this.canvas_el);
		this.setCanvasSize();
		this.event();
	}

	event() {
		let { contentEl } = this.playersevice.config;
		// 监听 dom size 变化， 调整canvas 大小
		this.resizeObserver = new ResizeObserver(() => {
		setTimeout(() => {
		this.setCanvasSize();
		//  this.resizeControlPannel();
		}, 20);
		});

		this.resizeObserver.observe(contentEl);
	}

	setCanvasSize() {
		let height = 200;
		let width = 400;
		let { contentEl } = this.playersevice.config;

		if (contentEl) {
		height = contentEl.clientHeight;
		width = contentEl.clientWidth;
		}

		this.canvas_el.width = width;
		this.canvas_el.height = height;
	}

	clearCanvas() {
		if(this.canvas_context) {
			let canvasContext = this.canvas_context;
			let canvas = this.canvas_el;
			this.clear = true;
			// 清除画布
			canvasContext.clearRect(0, 0, canvas.width, canvas.height);
		}
	  }

	initAudioContext() {
		if (!this.audioContext) {
			this.audioContext = new AudioContext({
				sampleRate: this.config.sampleRate,
			});
		}
		this.analyserNode=this.audioContext.createAnalyser();
		this.analyserNode.fftSize=analyseAudioConfig.fftsize;

		this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.value=1;

		this.setBufferData();
	}
	destroy() {
        this.audioContext.close();
		this.audioContext = null;
		this.hasInit = false;
		this.hasInitScriptNode = false;
		this.bufferList = [];
		this.playedBufferCount = 1000;
		this.playingIndex = 0;
		if (this.scriptNode) {
			this.scriptNode && this.scriptNode.disconnect();
		}

		this.gainNode && this.gainNode.disconnect();
		if(this.canvas_el) {
			this.clearCanvas();
			this.canvas_el.remove();
		}
	}


	feedPCMData(pcmData: Float32Array) {
		const { bufferSize, numberOfOutputChannels } = this.config;
		let allPCMData = new Float32Array((this.remainingPCMData.length + pcmData.length));
		allPCMData.set(this.remainingPCMData, 0);
		allPCMData.set(pcmData, this.remainingPCMData.length);
		let count = Math.floor(allPCMData.length / (bufferSize * numberOfOutputChannels));

		for (let i = 0; i < count; i++) {
			let bufferItem: PCMBufferItem = {
				data: [],
			};

			for (let outputChannel = 0; outputChannel < numberOfOutputChannels; outputChannel++) {
				bufferItem.data.push(new Float32Array(bufferSize));
			}

			for (let index = 0; index < bufferSize; index++) {
				for (let outputChannel = 0; outputChannel < numberOfOutputChannels; outputChannel++) {
					bufferItem.data[outputChannel][index] = allPCMData[outputChannel + index * numberOfOutputChannels + i * (bufferSize * numberOfOutputChannels)];
				}
			}
			this.bufferList.push(bufferItem);
		}
		this.remainingPCMData = allPCMData.slice(count * bufferSize * numberOfOutputChannels);
	}
	feedPCMDataBeta(pcmData: Float32Array) { // 单声道
		const { bufferSize } = this.config;
		let allPCMData = new Float32Array((this.remainingPCMData.length + pcmData.length));
		allPCMData.set(this.remainingPCMData, 0);
		allPCMData.set(pcmData, this.remainingPCMData.length);
		let count = Math.floor(allPCMData.length / bufferSize);
		for (let i = 0; i < count; i++) {
			let bufferItem: PCMBufferItem = {
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
		debugger;
		if (this.isLive) { // 在线播放
			scriptNode.onaudioprocess = (audioProcessingEvent) => {
				const { outputBuffer } = audioProcessingEvent;
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
		this.scriptNode.connect(this.analyserNode);
		this.analyserNode.connect(this.gainNode);
		this.gainNode.connect(this.audioContext.destination);
		this.hasInitScriptNode = true;
         this.mute(true);
	}

	setBufferData() {
        let second = analyseAudioConfig.bufferSize;
		let { sampleRate } = this.config;
		let bufferLength = this.analyserNode.frequencyBinCount;
        let dataArray = new Float32Array(bufferLength);
		this.dataArray=dataArray;
        // 根据 AudioContext 的采样率、所需的缓存时间和 FFT 大小来设置缓存区大小
        let bufferDataLength = Math.ceil(second * sampleRate / dataArray.length) * dataArray.length;
		this.bufferDataLength=bufferDataLength;

        this.bufferData = new Float32Array(bufferDataLength);
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
	convertInt16ArrayToFloat32(buffer: ArrayBuffer) {
		const dataView = new DataView(buffer);
		const float32Data = new Float32Array(buffer.byteLength / 2); // 每个样本2个字节
		for (let i = 0; i < float32Data.length; i++) {
			// 读取16位有符号整数，归一化到[-1.0, 1.0]
			float32Data[i] = dataView.getInt16(i * 2) / 32768.0;
		}
		return float32Data;
	  }

	mute(parm: boolean) {
		if (parm === true) {
			this.gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
		} else {
			this.gainNode.gain.setValueAtTime(1, this.audioContext.currentTime);
		}
	}

    setGain(v: number = 1) {
        try {
        this.gainNode.gain.value = v;
        } catch (e) {
          console.error('调整音频增益失败');
        }
      }

	updateBufferData() {
	  let { dataArray, bufferData } = this;
      let { bufferDataLength } = this;

      let { updataBufferPerSecond } = analyseAudioConfig;

      if (this.clear === true) {
        // this.destory()
        clearTimeout(this.timeId);

        return false;
      }
      // Move old data forward


      this.analyserNode?.getFloatTimeDomainData(dataArray);

      // 取到 0 数据不更新 bufferdata
      let hasZero = dataArray.some(value => value === 0);
      // debugger;
      if (hasZero === false) {
        bufferData.copyWithin(0, dataArray.length);
        // Add new data to the end of the buffer
        bufferData.set(dataArray, bufferDataLength - dataArray.length);
      }


      this.timeId = setTimeout(this.updateBufferData.bind(this), updataBufferPerSecond); // Updates at roughly 30 FPS
	}
	render() {
        let { showAudio } = this.playersevice.config;
        if (showAudio === true) {
          // this.playerService.canvasVideoService.loading = false;
		  this.drawSymmetricWaveform();
        }
	}
	drawSymmetricWaveform() {
		let dataArray = this.bufferData;
		let bufferLength = this.bufferDataLength;
		let canvasContext = this.canvas_context;
		let canvas = this.canvas_el;

		let { renderPerSecond } = analyseAudioConfig;
		let timeId: any = '';
		// canvasContext.lineWidth = 2;
		// canvasContext.strokeStyle = '#7f0';
		// setTimeout(() => {
		//   canvasContext.lineWidth = 5;
		//   canvasContext.strokeStyle = '#7f0';
		// }, 400);

		const AnimationFrame = () => {
		dataArray = this.bufferData;
			if (this.clear === true) {
				// This returns the function, effectively stopping the loop
				clearTimeout(timeId);
				return;
			}
			if (canvasContext.lineWidth != 1 || canvasContext.strokeStyle != '#77ff00') {
			canvasContext.lineWidth = 1;
			canvasContext.strokeStyle = '#77ff00';
			}
			// canvasContext.lineWidth = 1;
			// canvasContext.strokeStyle = '#7f0';


				canvasContext.clearRect(0, 0, canvas.width, canvas.height);
				// canvasContext.lineWidth = 2;
				// canvasContext.strokeStyle = '#7f0';

				canvasContext.beginPath();

				const sliceWidth = canvas.width / bufferLength;
				let x = 0;
				let gap = 10;
				let scale = canvas.height / 2;

				for (let i = 0; i < bufferLength; i++) {
					let v = dataArray[i];

					// // 对于上半部分
					// let y_upper = (1.0 - v) * canvas.height / 4; // 在原有基础上除以2，因为现在的画布分为上下两部分
					// // 对于下半部分
					// let y_lower = (1.0 + v) * canvas.height / 4 + canvas.height / 2; // 首先反转 v，然后加上画布高度的一半，使其位于下半部分


					let y_upper = v * scale + canvas.height / 2;
					// 对于下半部分
					let y_lower = -v * scale + canvas.height / 2;

				if (v === 0) {
					y_upper = canvas.height / 2 - gap / 2;
					y_lower = canvas.height / 2 + gap / 2;
				}

					if (i === 0) {
						canvasContext.moveTo(x, y_upper); // 上半部分
						canvasContext.moveTo(x, y_lower); // 下半部分
					} else {
						canvasContext.lineTo(x, y_upper); // 上半部分
						canvasContext.lineTo(x, y_lower); // 下半部分
					}


					x += sliceWidth;
				}

				canvasContext.lineTo(canvas.width, canvas.height / 2);
				canvasContext.stroke();

			// Use setTimeout here to loop function call. Adjust the delay time as per your requirement. Here 1000/60 mimics a framerate of 60 FPS, similar to requestAnimationFrame
			timeId = setTimeout(AnimationFrame.bind(this), renderPerSecond);
		};
		AnimationFrame();
	}
	showAudio() {
		this.playersevice.config.showAudio=true;
		this.updateBufferData();
		this.render();
	}
}

export default AudioContextPlayer;
