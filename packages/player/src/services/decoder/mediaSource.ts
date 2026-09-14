import { injectable, inject, Container, LazyServiceIdentifer } from 'inversify';
import CodecParser from 'codec-parser';
import PlayerService from '../player';

const MEDIA_SOURCE_STATE = {
  ended: 'ended',
  open: 'open',
  closed: 'closed',
};

const BUFFER = 5; // seconds of audio to store in SourceBuffer
const BUFFER_INTERVAL = 5; // seconds before removing from SourceBuffer


const MSEEvents = {
  ERROR: 'error',
  SOURCE_OPEN: 'source_open',
  UPDATE_END: 'update_end',
  BUFFER_FULL: 'buffer_full',
};


interface IAACFrame{
  crc32?: string;
  data?: Uint8Array;
  duration?: number;
  frameNumber?: number;
  samples?: number;
  totalBytesOut?: number;
  headers?: IAACHeader;
  codecFrames?: any;

}

interface IAACHeader{
  bitDepth?: number;
  bitrate?: number;
  bufferFullness?: number;
  channelMode?: string;//    'monophonic (mono)'
  channels?: number;
  copyrightId?: boolean;
  copyrightIdStart?: boolean;
  isHome?: boolean;
  isOriginal?: boolean;
  isPrivate?: boolean;
  layer?: string; // 'valid';
  length?: number; // 7;
  mpegVersion?: string; // 'MPEG-4';
  numberAACFrames?: number;
  profile?: string; // 'AAC LC (Low Complexity)';
  protection?: string; // 'none';
  sampleRate?: number; // 32000;
}


interface IAACfames{
  frames: Array<IAACFrame>;
  IframsData: Array<Uint8Array>;
  bufferData: Uint8Array;
}

@injectable()
class MseDecoder {
    mediaSource: MediaSource;
    sourceBuffer: SourceBuffer;
    mediaStream: MediaStream;
    inputMimeType: string;
    $videoElement: HTMLAudioElement | HTMLVideoElement;
    streamParser: CodecParser;
    private _mediaSourceCreatedPromise: Promise<void> | null = null;
    private _mediaSourceCreated(): Promise<void> {
      if (!this._mediaSourceCreatedPromise) {
        this._mediaSourceCreatedPromise = new Promise((resolve) => {
          this._mediaSourceCreatedNotify = resolve;
        });
      }
      return this._mediaSourceCreatedPromise;
    }
    private _mediaSourceCreatedNotify: () => void;

    private _mediaSourceOpenPromise: Promise<void> | null = null;
    private _mediaSourceOpenNotify: () => void; // 这是一个可选的函数类型
    private _mediaSourceOpen(): Promise<void> {
      if (!this._mediaSourceOpenPromise) {
        this._mediaSourceOpenPromise = new Promise((resolve) => {
          this._mediaSourceOpenNotify = resolve;
        });
      }
      return this._mediaSourceOpenPromise;
    }


    private _sourceBufferQueue: Array<Uint8Array>;
    private _sourceBufferRemoved: number;
    private bufferLength: number;
    private _sourceBuffers: {
      video: SourceBuffer;
      audio: SourceBuffer;
    };
    private playerService: PlayerService;


    constructor() {
      this.bufferLength = 1;// Seconds of audio to buffer before starting playback

      this._sourceBuffers = {
        video: null,
        audio: null,
      };
    }

    // 获取source buffer  最后一个已缓冲音频帧的时间位置
    get metadataTimestamp() {
      // this.$videoElement.buffered  這個方法也ok
      return (
        (this.mediaSource &&
          this.mediaSource.sourceBuffers.length &&
          Math.max(
            this.mediaSource.sourceBuffers[0].timestampOffset,
            this.mediaSource.sourceBuffers[0].buffered.length
              ? this.mediaSource.sourceBuffers[0].buffered.end(0)
              : 0,
          )) ||
        0
      );
    }


    get isAudioPlayer() {
      return true;
    }

    get currentTime() {
      if (this.$videoElement) {
          return this.$videoElement.currentTime;
      }
      return 0;
  }

    get waiting() {
      return new Promise((resolve) => {
        this.$videoElement.addEventListener('waiting', resolve, { once: true });
      });
    }


    get state() {
      return this.mediaSource && this.mediaSource.readyState;
  }


    get isStateOpen() {
        return this.state === MEDIA_SOURCE_STATE.open;
    }
   async init(playerService: PlayerService) {
        this._sourceBufferQueue = [];
        this.inputMimeType = 'audio/aac';
        this.playerService = playerService;
        this.initStreamParser();
        // this.createAudioEl();
        this.createMeidalEL();

        // this._mediaSourceCreated = new Promise((resolve) => {
        //   this._mediaSourceCreatedNotify = resolve;
        // });

        this._mediaSourceCreated();
        this._mediaSourceOpen();

        // this._mediaSourceOpen = new Promise((resolve) => {
        //   this._mediaSourceOpenNotify = resolve;
        // });


        // const sourceBuffer = this.mediaSoruce.addSourceBuffer('audio/aac');
        this.sourceBuffer = null;
    }

    initStreamParser() {
      const mimeType = 'audio/aac';

      const options = {
          onCodec: () => {},
          onCodecUpdate: () => {},
          enableLogging: true,
      };

      this.streamParser = new CodecParser(mimeType, options);
    }

    createMediaSource() {
        this.mediaSource = new MediaSource();
        this._mediaSourceCreatedNotify();

        this.mediaSource.addEventListener('sourceopen', () => {
          let mimeType = this.inputMimeType;
          this.sourceBuffer = this.mediaSource.addSourceBuffer(mimeType);
          this.sourceBuffer.mode = 'sequence';

          this.sourceBuffer.addEventListener('updateend', () => {
          //  debugger;

          this.appendNextBuffer();
          });


          this._sourceBufferRemoved = 0;
          // this.mediaSource.sourceBuffers[0].
          this._mediaSourceOpenNotify();
           this.$videoElement.play();
        });
    }

    play() {
      this.$videoElement.play();
    }

    // 检查_sourceBufferQueue 从中找一条 插入
    appendNextBuffer() {
      if (!this.sourceBuffer.updating && this._sourceBufferQueue.length) {
        let data = this._sourceBufferQueue.shift();
        this.sourceBuffer.appendBuffer(data);
      }
    }

    // createAudioEl() {
    //  // this.$videoElement = document.getElementById('aad');
    //  let { streamType } = this.playerService.config;

    //  if (streamType === 'AAC') {
    //   let { contentEl } = this.playerService.config;

    //   this.$videoElement = document.createElement('audio');
    //   this.$videoElement.controls = true;
    //   // debugger;
    //   contentEl.append(this.$videoElement);
    //  }
    // }
    createMeidalEL() {
      let { streamType } = this.playerService.config;
      if (streamType === 'AAC') {
        let { contentEl } = this.playerService.config;

        this.$videoElement = document.createElement('audio');
        this.$videoElement.controls = true;
        this.$videoElement.style.position='absolute';
        this.$videoElement.style.zIndex="20";

        contentEl.append(this.$videoElement);
      } else {
        let videoEl = document.createElement('video');

        videoEl.autoplay = true;
        videoEl.controls = false;

        this.$videoElement = videoEl;
      }
    }
   appendBuffer(buffer: Uint8Array) {
      let { inputMimeType } = this;

      if (this.sourceBuffer === null) {
        this.sourceBuffer = this.mediaSource.addSourceBuffer(inputMimeType);
        // const sourceBuffer = this.mediaSource.sourceBuffers[0];

        // debugger;
       }

       this._sourceBufferQueue.push(buffer);

      // if (this.mediaSource.sourceBuffers.length) {
      //   // this._sourceBufferQueue.push(buffer);
      // } else {
      // }

      // if (this.mediaSource.sourceBuffers.length > 1) {
      //    debugger;
      // }

      this.appendNextBuffer();
    }


     addFrames(codecFrames: IAACfames['frames']) {
       // codecFrames = codecFrames.splice(100, 200);

      // 将一个 Uint8Array 数组中的所有缓冲区（buffers）连接成一个单一的 Uint8Array
        const concatBuffers = (buffers: Array<Uint8Array>) => {
            // 计算所有缓冲区的总长度
            const buffer = new Uint8Array(
              buffers.reduce((acc, buf) => acc + buf.length, 0),
            );

            // 填充新的 Uint8Array:
            buffers.reduce((offset, buf) => {
              buffer.set(buf, offset);
              return offset + buf.length;
            }, 0);

            return buffer;
          };

        let buffersArray: Array<Uint8Array> = codecFrames.map((value) => {
            return value.data;
        });


        let buffer: Uint8Array = concatBuffers(buffersArray);


        this._appendSourceBuffer(buffer);
    }

     _appendSourceBuffer(buffer: Uint8Array) {
     this.appendBuffer(buffer);
    }

   async attachMediaSource() {
       this.$videoElement.loop = false;
        let mediaUrl = URL.createObjectURL(this.mediaSource);
        this.$videoElement.src = mediaUrl;


        // debugger;
    }

   async start() {
      this.createMediaSource();


      await this._mediaSourceCreated();


      await this.attachMediaSource();

      // this.audioProcessingService.visulizerDraw1();
    }

    abortSourceBuffer() {
      if (this.isStateOpen) {
        if (this.sourceBuffer) {
            this.sourceBuffer.abort();
            this.sourceBuffer = null;
        }
      }
    }


   async cleanSourceBuffer() {
      if (
        this.$videoElement.currentTime > BUFFER + this.bufferLength &&
        this._sourceBufferRemoved + BUFFER_INTERVAL * 1000 < performance.now()
      ) {
        this._sourceBufferRemoved = performance.now();
        this.mediaSource.sourceBuffers[0].remove(
          0,
          this.$videoElement.currentTime - BUFFER + this.bufferLength,
        );
      }
    }

    endOfStream() {
      const { $videoElement } = this;
      if (this.isStateOpen && $videoElement && $videoElement.readyState >= 1) {
          try {
              this.mediaSource.endOfStream();
          } catch (e) {
              console.warn('MediaSource', 'endOfStream() error', e);
          }
      }
    }


    async onstream(frames: IAACfames['frames']) {
      await this._mediaSourceOpen();
       this.addFrames(frames); // wait for the source buffer
    }

    inputStream() {


    }

   removeBuffer(start: number, end: number) {
    this.sourceBuffer.remove(start, end);
   }


   processMediaStream() {
    const stream = this.$videoElement.captureStream();
    const audioTrack = stream.getAudioTracks()[0];


    const trackProcessor = new MediaStreamTrackProcessor({ track: audioTrack });

    const reader = trackProcessor.readable.getReader();

    reader.read().then(function process({ done, value }) {
      reader.read().then(process);
      });
   }
}


export default MseDecoder;