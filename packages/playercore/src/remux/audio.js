// 假设 audioTrack.samples 包含了原始音频帧数据
let audioContext = new AudioContext();
let audioBufferSourceNode = audioContext.createBufferSource();

function processSamples(samples) {
    // 假设 samples 是一个包含原始音频帧数据的数组
    samples.forEach(sample => {
        
        audioContext.decodeAudioData(sample.unit.buffer, (audioBuffer) => {
            // 解码成功，使用 AudioBuffer
            audioBufferSourceNode.buffer = audioBuffer;
            audioBufferSourceNode.connect(audioContext.destination);
            audioBufferSourceNode.start();
        }, (e) => {
            // 解码出错
            console.error('Error decoding audio data', e);
        });
    });
}

// 用 audioTrack.samples 调用此函数来处理和播放音频
processSamples(audioTrack.samples);
