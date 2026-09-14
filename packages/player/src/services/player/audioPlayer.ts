class AudioContextPlayer {
    private audioContext: AudioContext | null;
    private hasInitScriptNode: boolean;
    private hasInitAudioWorkletNode: boolean;
    private bufferList: PCMBufferItem[];
    private playedBufferCount: number;
    private playingIndex: number;
    private currentTime: number;
    private remainingPCMData: Float32Array;
    private hasInit: boolean;
    private gainNode: GainNode | null;
    private scriptNode?: ScriptProcessorNode;
    private audioWorkletNode?: AudioWorkletNode;
    private isLive: boolean;
    private config: AudioPlayerConfig;
    private replayCounts: number;
    private replayPCMData: Float32Array;

    constructor(preProcessingService?: any) {
      this.audioContext = null;
      this.hasInitScriptNode = false;
      this.hasInitAudioWorkletNode = false;
      this.bufferList = [];
      this.playedBufferCount = 1000;
      this.playingIndex = 0;
      this.currentTime = 0;
      this.remainingPCMData = new Float32Array(0);
      this.hasInit = false;
      this.gainNode = null;
      this.isLive = true;
      this.replayCounts = 0;
      this.replayPCMData = new Float32Array(0);
    }
    convetBufferToPcmFloat32(buffer: ArrayBuffer) {
        const dataView = new DataView(buffer);
        let float32Data = new Float32Array(buffer.byteLength / 2); // Each sample is 2 bytes
        for (let i = 0; i < float32Data.length; i++) {
            // Read 16-bit signed integer and normalize it to the range [-1.0, 1.0]
            float32Data[i] = dataView.getInt16(i * 2, true) / 32768.0;
        }
        return float32Data;
    }
    init(config: Partial<AudioPlayerConfig>) {
      const defaultConfig: AudioPlayerConfig = {
        sampleRate: 32000,
        bufferSize: 1024,
        numberOfOutputChannels: 1,
        isLive: true,
      };
      this.config = { ...defaultConfig, ...config };
      const { isLive } = this.config;
      this.isLive = isLive;
      this.initAudioContext();
      this.initScriptNode();
      this.hasInit = true;
    }

    private initAudioContext() {
      if (!this.audioContext) {
        this.audioContext = new AudioContext({
          sampleRate: this.config.sampleRate,
        });
      }
      this.gainNode = this.audioContext.createGain();
    }

    destroy() {
      this.audioContext = null;
      this.hasInit = false;
      this.hasInitScriptNode = false;
      this.bufferList = [];
      this.playedBufferCount = 1000;
      this.playingIndex = 0;
      if (this.scriptNode) {
        this.scriptNode.disconnect();
      }
      if (this.audioWorkletNode) {
        this.audioWorkletNode.disconnect();
      }
      this.gainNode && this.gainNode.disconnect();
    }

    feedPCMDataBeta(pcmData: Float32Array) {
      const { bufferSize } = this.config;
      const allPCMData = new Float32Array(this.remainingPCMData.length + pcmData.length);
      allPCMData.set(this.remainingPCMData, 0);
      allPCMData.set(pcmData, this.remainingPCMData.length);
      const count = Math.floor(allPCMData.length / bufferSize);
      for (let i = 0; i < count; i++) {
        const bufferItem: PCMBufferItem = {
          data: [allPCMData.slice(i * bufferSize, (i + 1) * bufferSize)],
        };
        this.bufferList.push(bufferItem);
      }
      this.remainingPCMData = allPCMData.slice(count * bufferSize);
    }

    private initScriptNode() {
      if (this.hasInitScriptNode) {
        return;
      }
      const { bufferSize, numberOfOutputChannels } = this.config;
      const scriptNode = this.audioContext!.createScriptProcessor(bufferSize, 0, numberOfOutputChannels);
      if (this.isLive) {
        scriptNode.onaudioprocess = (audioProcessingEvent: AudioProcessingEvent) => {
          const { outputBuffer } = audioProcessingEvent;
          if (this.bufferList.length) {
            const bufferItem = this.bufferList.shift()!;
            for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
              const nowBuffering = outputBuffer.getChannelData(channel);
              nowBuffering.set(bufferItem.data[channel]);
            }
          } else if (this.replayCounts > 0) {
            this.replayCounts--;
            this.feedPCMDataBeta(this.replayPCMData);
          }
        };
      }

      this.scriptNode = scriptNode;
      this.scriptNode.connect(this.gainNode!);
      this.gainNode!.connect(this.audioContext!.destination);
      this.hasInitScriptNode = true;
    }

    updateCurrentTime(currentTime: number) {
      const second = currentTime / 1000;
      this.currentTime = second;
      const buffered = this.buffered();
      this.emit('audioInfo', { second, buffered });
    }

    isBuffered(second: number) {
      const ms = second * 1000;
      const index = this.bufferList.findIndex((item) => {
        return ms >= item.timestamp && ms <= item.timestamp + item.duration;
      });
      return index !== -1;
    }

    buffered() {
      if (this.bufferList && this.bufferList.length) {
        const { length } = this.bufferList;
        return {
          start: this.bufferList[0].timestamp / 1000,
          end: (this.bufferList[length - 1].timestamp + this.bufferList[length - 1].duration) / 1000,
        };
      }
    }

    bufferedIndex(second: number) {
      const ms = second * 1000;
      const index = this.bufferList.findIndex((item) => {
        return ms >= item.timestamp && ms <= item.timestamp + item.duration;
      });
      return index;
    }

    play() {
      if (this.audioContext!.state === 'suspended') {
        this.audioContext!.resume();
      }
    }

    pause() {
      if (this.audioContext!.state === 'running') {
        this.audioContext!.suspend();
      }
    }

    mute(parm: boolean) {
      if (parm === true) {
        this.gainNode!.disconnect();
      } else {
        this.gainNode!.connect(this.audioContext!.destination);
      }
    }

    private emit(event: string, data: any) {
      // Implementation for emitting events
    }
  }

  interface PCMBufferItem {
    data: Float32Array[];
    timestamp?: number;
    duration?: number;
  }

  interface AudioPlayerConfig {
    sampleRate: number;
    bufferSize: number;
    numberOfOutputChannels: number;
    isLive: boolean;
  }

  export default AudioContextPlayer;
