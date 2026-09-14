class pcmPlayer2 {
    constructor(config) {
        this.config = {
            sampleRate: 16000, // 设置默认采样率
            channels: 1, // 设置默认声道数
            bufferSize: 8192 // 设置默认缓冲区大小
        };

        // 初始化音频上下文
        this.audioContext = new AudioContext({ sampleRate: this.config.sampleRate });
        // 缓存PCM数据
        this.bufferList = [];
        // 初始化音频处理节点
        this.initScriptNode();
    }

    initScriptNode() {
        // 创建ScriptProcessorNode来处理音频
        this.scriptNode = this.audioContext.createScriptProcessor(this.config.bufferSize, 1, 1);
        this.scriptNode.onaudioprocess = this.handleAudioProcess.bind(this);
        // 连接到音频输出
        this.scriptNode.connect(this.audioContext.destination);
    }

    // handleAudioProcess(audioProcessingEvent) {
    //     let { outputBuffer } = audioProcessingEvent;
    //     let inputBuffer = this.getInputBuffer();

    //     // 写入每个声道的数据
    //     for (let channel = 0; channel < this.config.channels; channel++) {
    //         let outputData = outputBuffer.getChannelData(channel);
    //         for (let i = 0; i < this.config.bufferSize; i++) {
    //             outputData[i] = inputBuffer[i * this.config.channels + channel] || 0;
    //         }
    //     }
    // }

    handleAudioProcess(audioProcessingEvent) {
        let { outputBuffer } = audioProcessingEvent;
        let requiredSize = this.config.bufferSize * this.config.channels;
        let inputBuffer = this.processBuffer(); // 确保这里返回的是正确的数据和长度

        // 遍历每个声道
        for (let channel = 0; channel < this.config.channels; channel++) {
            let outputData = outputBuffer.getChannelData(channel);

            // 对于每个声道，填充数据
            for (let i = 0; i < this.config.bufferSize; i++) {
                // 保证不越界
                let index = i * this.config.channels + channel;
                if (index < inputBuffer.length) {
                    outputData[i] = inputBuffer[index];
                } else {
                    outputData[i] = 0; // 数据不足时填充静音
                }
            }
        }
    }

     convertInt16ArrayToFloat32(buffer) {
        const dataView = new DataView(buffer);
        const float32Data = new Float32Array(buffer.byteLength / 2); // 每个样本2个字节
        for (let i = 0; i < float32Data.length; i++) {
            let int16 = dataView.getInt16(i * 2);
            if (int16 === -32768) {
                float32Data[i] = -1.0;
            } else {
                float32Data[i] = int16 / 32768.0;
            }
        }
        return float32Data;
    }


      processBuffer() {
        let requiredSize = this.config.bufferSize * this.config.channels;
        let bufferData = new Float32Array(requiredSize);
        let dataIndex = 0;

        // 累积足够的数据填充输出缓冲区
        while (this.bufferList.length > 0 && dataIndex < requiredSize) {
            let currentData = this.bufferList.shift();
            let copyLength = Math.min(currentData.length, requiredSize - dataIndex);
            bufferData.set(currentData.slice(0, copyLength), dataIndex);
            dataIndex += copyLength;
        }

        // 如果数据不足以填满缓冲区，使用静音数据填充余下部分
        if (dataIndex < requiredSize) {
            bufferData.fill(0, dataIndex);
        }


        return bufferData;
    }
    // getInputBuffer() {
    //     let requiredSize = this.config.bufferSize * this.config.channels;
    //     let bufferData = new Float32Array(requiredSize);
    //     let dataIndex = 0;

    //     while (this.bufferList.length > 0 && dataIndex < requiredSize) {
    //         let currentData = this.bufferList.shift();
    //         let copyLength = Math.min(currentData.length, requiredSize - dataIndex);
    //         bufferData.set(currentData.slice(0, copyLength), dataIndex);
    //         dataIndex += copyLength;
    //     }

    //     return bufferData;
    // }

    feedData(pcmData) {
        // 添加PCM数据到缓冲列表
        this.bufferList.push(pcmData);
    }

    updateConfig(newConfig) {
        // 动态更新配置项
        if (newConfig.sampleRate && newConfig.sampleRate !== this.config.sampleRate) {
            this.audioContext.close();
            this.config.sampleRate = newConfig.sampleRate;
            this.audioContext = new AudioContext({ sampleRate: this.config.sampleRate });
            this.initScriptNode();
        }
        if (newConfig.channels) {
            this.config.channels = newConfig.channels;
            this.initScriptNode();
        }
        if (newConfig.bufferSize) {
            this.config.bufferSize = newConfig.bufferSize;
            this.initScriptNode();
        }
    }
}


export default pcmPlayer2;