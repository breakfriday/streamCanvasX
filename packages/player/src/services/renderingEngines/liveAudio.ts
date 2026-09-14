// class LiveAudio {
//     private audioContext: AudioContext;
//     private scriptProcessor: ScriptProcessorNode;
//     private audioQueue: Float32Array[];
//     private handleFn: (data: Float32Array) => void; // 处理函数

//     constructor(bufferSize: number = 1024, handleFn: (data: Float32Array) => void) {
//         this.audioContext = new AudioContext();
//         this.scriptProcessor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
//         this.audioQueue = [];
//         this.handleFn = handleFn; // 设置处理函数

//         this.scriptProcessor.onaudioprocess = (event: AudioProcessingEvent) => {
//             const outputData = event.outputBuffer.getChannelData(0);

//             if (this.audioQueue.length > 0) {
//                 // 如果队列中有数据，取出并处理
//                 const inputData = this.audioQueue.shift();
//                 outputData.set(inputData);
//             } else {
//                 // 如果没有数据，填充零
//                 outputData.fill(0);
//             }

//             // 使用传入的处理函数
//             this.handleFn(outputData);
//         };
//     }

//     // 从外部源接收并存储PCM数据
//     receiveData(pcmData: Float32Array) {
//         this.audioQueue.push(pcmData);
//     }
// }


class LiveAudio {
    private audioContext: AudioContext;
    private scriptProcessor: ScriptProcessorNode;
    private audioQueue: Array<Float32Array>[];
    private channels: number;
    private handleFn: (data: Array<Float32Array>) => void;

    constructor(channels: number = 32, bufferSize: number = 1024, handleFn: (data: Array<Float32Array>) => void) {
        this.audioContext = new AudioContext();
        this.scriptProcessor = this.audioContext.createScriptProcessor(bufferSize, channels, channels);
        this.channels = channels;
         this.audioQueue = [];
       // this.audioQueue = Array(channels).fill(null).map(() => []); //
        this.handleFn = handleFn;
        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = 0;


        this.scriptProcessor.onaudioprocess = (event: AudioProcessingEvent) => {
            const outputBuffers: Array<Float32Array> = [];


            for (let channel = 0; channel < this.channels; channel++) {
                outputBuffers.push(event.outputBuffer.getChannelData(channel));
            }


            if (this.audioQueue.length > 0) {
                // If there is data in the queue, use it
                const inputData = this.audioQueue.shift();
                inputData.forEach((channelData, index) => {
                    outputBuffers[index].set(channelData);
                });
            } else {
                // If no data, fill each channel with zeros
                outputBuffers.forEach(buffer => buffer.fill(0));
            }


            // debugger
            // Handle the multi-channel data
            this.handleFn(outputBuffers);
        };
        // this.scriptProcessor.connect(this.audioContext.destination);
        this.scriptProcessor.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        // this.audioContext.resume();
        // this.scriptProcessor.disconnect(this.audioContext.destination)
    }

    // Receive and store PCM data for all channels
    receiveData(pcmDataArray: Array<Float32Array>) {
        if (pcmDataArray.length !== this.channels) {
            throw new Error('Incorrect number of channels in input data');
        }
        this.audioQueue.push(pcmDataArray);
    }
}


export default LiveAudio;
