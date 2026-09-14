// AudioContextPlayer.js

// 1. 定义运行在独立音频线程的 Worklet 处理器代码 (以字符串形式存在，方便打包工具处理)
const workletCode = `
class PCMProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.chunks = []; // 用于存储接收到的 PCM 数据块
        this.totalLength = 0; // 当前缓冲区的总采样数
        this.maxBufferLength = 8000 * 2; // 最大允许积压的采样数 (例如8000Hz下积压2秒)

        // 接收主线程发来的 PCM 数据
        this.port.onmessage = (event) => {
            const pcmData = event.data;
            if (pcmData && pcmData.length > 0) {
                this.chunks.push(pcmData);
                this.totalLength += pcmData.length;

                // 防积压机制：如果网络卡顿后突然涌入大量历史数据，丢弃旧数据以保证实时性
                while (this.totalLength > this.maxBufferLength && this.chunks.length > 1) {
                    const dropped = this.chunks.shift();
                    this.totalLength -= dropped.length;
                }
            }
        };
    }

    // 核心音频处理循环 (每次通常请求 128 个采样点)
    process(inputs, outputs, parameters) {
        const output = outputs[0];     // 第一个输出节点
        const channel = output[0];     // 左声道 (单声道)
        const channelLength = channel.length; 

        // 如果缓冲区数据不足，直接输出静音，等待数据累积
        if (this.totalLength < channelLength) {
            return true; // 保持处理器活跃
        }

        let outputIndex = 0;

        // 从队列中提取数据填充到输出缓冲区
        while (outputIndex < channelLength && this.chunks.length > 0) {
            const chunk = this.chunks[0];
            const spaceLeft = channelLength - outputIndex;

            if (chunk.length <= spaceLeft) {
                // 当前块数据不够或刚好填满剩余空间：消费整个块
                channel.set(chunk, outputIndex);
                outputIndex += chunk.length;
                this.totalLength -= chunk.length;
                this.chunks.shift(); // 移除已耗尽的块
            } else {
                // 当前块数据比剩余空间多：只消费一部分
                // 注意：subarray 是创建视图，不会产生内存拷贝开销
                channel.set(chunk.subarray(0, spaceLeft), outputIndex);
                this.chunks[0] = chunk.subarray(spaceLeft); // 保留剩余部分
                outputIndex += spaceLeft;
                this.totalLength -= spaceLeft;
            }
        }

        return true;
    }
}

// 注册处理器
registerProcessor('pcm-processor', PCMProcessor);
`;

class AudioContextPlayer {
    constructor() {
        this.audioContext = null;
        this.workletNode = null;
        this.gainNode = null;
        this.hasInit = false;
        this.workletUrl = null;
    }

    async init(config) {
        const default_config = {
            sampleRate: 8000,
            gainValue: 1, // 增益控制，默认1避免削峰失真
            fftSize:128,
            bufferSize:2.5
        };
        this.config = Object.assign(default_config, config);
        
        await this.initAudioContext();
        this.hasInit = true;
    }

    async initAudioContext() {
        if (!this.audioContext) {
            this.audioContext = new AudioContext({
                sampleRate: this.config.sampleRate,
            });
        }

        // 创建增益节点（音量控制）
        if (!this.gainNode) {
            this.gainNode = this.audioContext.createGain();
            this.gainNode.gain.value = this.config.gainValue;
            this.gainNode.connect(this.audioContext.destination);
        }
        if (!this.analyserNode) {
            this.analyserNode = this.audioContext.createAnalyser();
            this.analyserNode.fftSize = this.config.fftSize;
            // 将 Analyser 连接到 Gain
            this.analyserNode.connect(this.gainNode);


            this.bufferLength = this.analyserNode.frequencyBinCount;
            //this.dataArray = new Float32Array(this.bufferLength);
           this.dataArray = new Float32Array(this.analyserNode.fftSize);
            this.setBufferData()
        }

        // 动态加载 AudioWorklet 模块
        try {
            // 将 Worklet 代码转换为 Blob URL，避免构建工具(Webpack/Vite)的路径问题
            const blob = new Blob([workletCode], { type: 'application/javascript' });
            this.workletUrl = URL.createObjectURL(blob);

            await this.audioContext.audioWorklet.addModule(this.workletUrl);
            
            // 实例化 Worklet 节点
            this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor');
            this.workletNode.connect(this.analyserNode);

            console.log("AudioWorklet initialized successfully.");
        } catch (error) {
            console.error("Failed to initialize AudioWorklet:", error);
        }
    }

    getWaveformHistory() {
        return this.bufferData;
    }

      setBufferData() {
         let second = this.config.bufferSize;
    
       this.bufferDataLength = Math.ceil(second * this.audioContext.sampleRate / this.dataArray.length) * this.dataArray.length;

       this.bufferData = new Float32Array(this.bufferDataLength);

      }
      updatBufferData(){
             let { dataArray, bufferData } = this;
      let { bufferDataLength } = this;

      let { updataBufferPerSecond } = this.config;

      if (this.clear === true) {
        clearTimeout(this.timeId);

        return false;
      }
      this.analyserNode?.getFloatTimeDomainData(dataArray);

       bufferData.copyWithin(0, dataArray.length);
        // Add new data to the end of the buffer
        bufferData.set(dataArray, bufferDataLength - dataArray.length);

      this.timeId = setTimeout(this.updatBufferData.bind(this), updataBufferPerSecond); // Updates at roughly 30 FPS
    

      }

    feedPCMDataBeta(pcmData) {
        if (!this.hasInit || !this.workletNode) {
            return false;
        }
        
        // 直接通过 MessagePort 将 Float32Array 发送给底层音频线程
        // 这里的传递非常高效，底层会直接接收数据块
        if (pcmData && pcmData.length > 0) {
            this.workletNode.port.postMessage(pcmData);
        }
    }

    play() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    pause() {
        if (this.audioContext && this.audioContext.state === 'running') {
            this.audioContext.suspend();
        }
    }

    mute(isMuted) {
        if (!this.gainNode || !this.audioContext) return;
        if (isMuted) {
            this.gainNode.disconnect();
        } else {
            this.gainNode.connect(this.audioContext.destination);
        }
    }

    async destroy() {
        this.hasInit = false;

        if (this.workletNode) {
            this.workletNode.disconnect();
            this.workletNode = null;
        }

        if (this.gainNode) {
            this.gainNode.disconnect();
            this.gainNode = null;
        }

        if (this.audioContext) {
            await this.audioContext.close();
            this.audioContext = null;
        }

        // 释放 Blob URL 内存
        if (this.workletUrl) {
            URL.revokeObjectURL(this.workletUrl);
            this.workletUrl = null;
        }
    }
}

export default AudioContextPlayer;