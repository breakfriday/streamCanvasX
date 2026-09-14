class PCMToMSEPlayer {
    constructor(config) {
        this.sampleRate = 16000 || 44100; // Default sample rate of 44100 Hz
        this.channels = 1 || 2; // Default to stereo audio
        this.bitsPerSample = 16 || 16; // Default to 16 bits per sample

        this.mediaSource = new MediaSource();
        this.audio = document.createElement('audio');
        this.audio.src = URL.createObjectURL(this.mediaSource);
        document.body.appendChild(this.audio);
        this.sourceBuffer = null;
    }

    onMediaSourceOpen() {
        // Assuming 'audio/webm; codecs="opus"' is supported by the browser
        this.sourceBuffer = this.mediaSource.addSourceBuffer('audio/webm; codecs="opus"');
    }

    createWAVHeader(dataLength) {
        const blockAlign = this.channels * this.bitsPerSample / 8;
        const byteRate = this.sampleRate * blockAlign;
        const dataSize = dataLength * blockAlign;
        const buffer = new ArrayBuffer(44);
        const view = new DataView(buffer);

        // RIFF header
        this.writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        this.writeString(view, 8, 'WAVE');

        // fmt subchunk
        this.writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true); // Subchunk size (16 for PCM)
        view.setUint16(20, 1, true); // Audio format (1 for PCM)
        view.setUint16(22, this.channels, true);
        view.setUint32(24, this.sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, this.bitsPerSample, true);

        // data subchunk
        this.writeString(view, 36, 'data');
        view.setUint32(40, dataSize, true);

        return buffer;
    }

    writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    feedPCMData(pcmData: ArrayBuffer) {
        // 计算PCM数据中包含的样本数量
        const numSamples = pcmData.byteLength / (this.bitsPerSample / 8);
        // 创建wav 头部， 传入样本数
        const wavHeader = this.createWAVHeader(numSamples);
        // 创建一个足够大的Uint8Array数组，能够存储WAV头部和PCM数据的总字节数
        const combinedData = new Uint8Array(wavHeader.byteLength + pcmData.byteLength);
        combinedData.set(new Uint8Array(wavHeader), 0);
        combinedData.set(new Uint8Array(pcmData), wavHeader.byteLength);

        // Here you would need to encode this combined data to a format supported by MSE
        // For demonstration, we'll append the raw data which won't work directly
        // as browsers don't support WAV in MSE
        if (this.sourceBuffer && !this.sourceBuffer.updating) {
            this.sourceBuffer.appendBuffer(combinedData);
        }
    }

    start() {
        this.mediaSource.addEventListener('sourceopen', this.onMediaSourceOpen.bind(this));
        this.audio.play();
    }
}
