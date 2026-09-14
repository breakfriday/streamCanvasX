class LiveAudioProcessor {
    private audioContext: AudioContext;
    private scriptProcessor: ScriptProcessorNode;
    private audioQueue: Float32Array[];

    constructor(bufferSize: number = 4096) {
        this.audioContext = new AudioContext();
        this.scriptProcessor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
        this.audioQueue = [];

        this.scriptProcessor.onaudioprocess = (event: AudioProcessingEvent) => {
            const outputData = event.outputBuffer.getChannelData(0);

            if (this.audioQueue.length > 0) {
                // 如果队列中有数据，取出并处理
                const inputData = this.audioQueue.shift();
                outputData.set(inputData);
            } else {
                // 如果没有数据，填充零
                outputData.fill(0);
            }

            // 这里可以添加波形绘制的逻辑
        };

        this.scriptProcessor.connect(this.audioContext.destination);
    }

    // 从外部源接收并存储PCM数据
    receiveData(pcmData: Float32Array) {
        this.audioQueue.push(pcmData);
    }
}
