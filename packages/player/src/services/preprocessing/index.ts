import { injectable, inject, Container, LazyServiceIdentifer } from 'inversify';

import PlayerService from '../player';

import Decrypt from './decrypt/sm4';

import CodecParser from 'codec-parser';

import WebcodecsAudioDecoder from '../decoder/audioDecoder';
import AudioContextPlayer from '../player/audioContextPlayer';
import muxjs from 'mux.js';

@injectable()
class PreProcessing {
    player: PlayerService;
    webcodecsAudioDecoder: WebcodecsAudioDecoder;
    audioContextPlayer: AudioContextPlayer;
    decrypt: Decrypt;
    streamParser: CodecParser;

    constructor() {

    }
    initAccStreamParser() {
        const mimeType = 'audio/aac';
        const options = {
        onCodec: () => {},
        onCodecUpdate: () => {},
        enableLogging: true,
    };

    this.streamParser = new CodecParser(mimeType, options);
    }
    init(playerService: PlayerService) {
        this.player = playerService;
        if (this.player?.config?.audioPlayback?.method == 'MSE') {
            this.player.mseDecoderService.start();
        } else if (this.player?.config?.audioPlayback?.method == 'AudioContext') {
            this.audioContextPlayer = new AudioContextPlayer();
            this.audioContextPlayer.init();
            this.webcodecsAudioDecoder = this.audioContextPlayer.webcodecsAudioDecoder;
            this.webcodecsAudioDecoder.init();
        }
        if (this.player?.config?.crypto?.enable === true) {
            this.decrypt = new Decrypt(this.player.config.crypto, this);
        }
        if (this.player.config.streamType === 'AAC') {
            this.player.mseDecoderService.start();

            this.initAccStreamParser();
        }
    }
    streamMp4(reader: ReadableStreamDefaultReader) {
        let { fileData } = this.player.config;

        let { meidiaEl } = this.player;
        let BlobuRL = URL.createObjectURL(fileData);
        this.player.meidiaEl.src = BlobuRL;


        this.player.canvasVideoService.createVideoFramCallBack(meidiaEl);
    }

    async streamAAC(reader: ReadableStreamDefaultReader) {
        if (this.player?.config?.crypto?.enable === true) {
            // 加密的acc 音频
            this.decrypt.processStream(reader);
        } else {
            // 纯acc 音频
            while (true) {
                try {
                    const { done, value } = await reader.read();

                    const chunk = value?.buffer;
                    // console.log(chunk);
                    if (done) {
                        console.log('Stream complete');
                        return;
                    }


                    let { streamParser } = this;


                    let frames = [...streamParser.parseChunk(value)];
                    // console.log(frames);
                    // debugger;

                    if (this.player?.config?.audioPlayback?.method == 'MSE') {
                        this.player.mseDecoderService.onstream(frames);
                    } else if (this.player?.config?.audioPlayback?.method == 'AudioContext') {
                        this.audioContextPlayer.audioContextPlayer(frames);
                    }
                } catch (e) {
                    console.error('Error reading stream', e);
                    return;
                }
            }
        }
    }
    async streamMPEGTS(reader: ReadableStreamDefaultReader) {
        let { fileData } = this.player.config;
        let { meidiaEl } = this.player;
        let transmuxer = new muxjs.mp4.Transmuxer();
        transmuxer.on('data', (segment) => {
            let combined = new Uint8Array(segment.initSegment.byteLength + segment.data.byteLength);
            combined.set(segment.initSegment, 0);
            combined.set(segment.data, segment.initSegment.byteLength);

            let blob = new Blob([combined], { type: 'video/mp4' });
            let BlobuRL = URL.createObjectURL(blob);

           // let aaa = muxjs.mp4.tools.inspect(segment);

            meidiaEl.src = BlobuRL;

            this.player.canvasVideoService.createVideoFramCallBack(meidiaEl);
        });


        debugger;
        const { done, value } = await reader.read();

        debugger;
        transmuxer.push(new Uint8Array(value.buffer));
        transmuxer.flush();
    }
    async processStream(reader: ReadableStreamDefaultReader) {
        let { streamType } = this.player.config;
        debugger;
        switch (streamType) {
            case 'AAC':
              this.streamAAC(reader);
              break;
            case 'MP4':
                this.streamMp4(reader);
                break;
            case 'MPEG-TS':
                  this.streamMPEGTS(reader);
                  debugger;
            default:
               console.log('no streamType');
          }
    }
}


export default PreProcessing;