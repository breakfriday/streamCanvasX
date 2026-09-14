
/* eslint-disable no-negated-condition */
import { injectable, inject, Container, LazyServiceIdentifer } from 'inversify';
 import { Muxer as MuxerWebm, ArrayBufferTarget as ArrayBufferTargetWebm } from 'webm-muxer';
 import { Muxer as MuxerMp4, ArrayBufferTarget as ArrayBufferTargetMp4 } from 'mp4-muxer';
// import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import Emitter from '../../utils/emitter';
import PlayerService from '../player';
import { videoCodecs, videoBitrates, fileTypes } from './config';

enum OutputFormat {
    MP4 = 'MP4',
    WebM = 'WebM',
  }
@injectable()
class canvasToVideo {
    public recording: boolean;
    private videoEncoder: VideoEncoder | null;
    private audioEncoder: AudioEncoder | null;
    private intervalId: ReturnType<typeof setInterval>;
    private audioTrack: MediaStreamTrack;
    private audioSampleRate: number;
    private canvas: HTMLCanvasElement;
    private IContext2D: CanvasRenderingContext2D;
    private muxer: MuxerWebm<ArrayBufferTargetWebm> | MuxerMp4<ArrayBufferTargetMp4>;
    private startTime: CSSNumberish | null;
    private lastKeyFrame: number;
    private recordTextContent: string;
    private player: PlayerService;
    private outputFormat: OutputFormat;
    private hasAudioConfigure: boolean;
    private _recordConfig: {
        videoCodec?: string;
        audioCodec?: string;
        audioChannelCount?: number;
        audioSampleRate?: number;
        videoBitrate?: number;
    };
    private options: {
        videoBitrates: Array<{value: number | string; label: string}>;
        fileTypes: Array<{value: number | string; label: string}>;
        videoCodecs: Array<{value: number | string; label: string}>;
    };
    constructor() {
       this.options = { videoCodecs, videoBitrates, fileTypes };
    }
    init(playerService: PlayerService) {
        // if (parm.canvas) {
        //     this.canvas = parm.canvas;
        // }

        this.outputFormat = OutputFormat.MP4;

        this.player = playerService;
        // this.canvas = this.player.canvasVideoService.canvas_el;
    }

    setCanvas(parm?: {canvas?: HTMLCanvasElement}) {
        if (parm && parm.canvas) {
            this.canvas = parm.canvas;
        } else {
            if (this.player.config.showAudio === true) {
                this.canvas = this.player.canvasVideoService.canvas_el;
            } else {
                this.canvas = this.player.canvasVideoService.canvas_el2;
            }
        }
    }

    async getAudioTrack() {
        // if (typeof AudioEncoder !== 'undefined') {
        //     try {
        //         let userMedia = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        //         this.audioTrack = userMedia.getAudioTracks()[0];
        //     } catch (e) {}
        // } else {
        //     console.log('no support AudioEncoder');
        // }

        // const stream = video.captureStream();
        // const audioTrack = stream.getAudioTracks()[0];
        // this.audioTrack = audioTrack;
        // this.audioSampleRate = 48000;
    }

    getRecordConfig() {
        if (!this._recordConfig) {
          this.setRecordConfig();
        }
        return this._recordConfig;
    }
    setRecordConfig(data?: {}) {
        let { videoCodec = 'avc1.4d4029', audioCodec, audioChannelCount, audioSampleRate } = this.player.mediaInfo || {};
        videoCodec = videoCodec == null ? 'avc1.4d4029' : videoCodec;
        let config = { videoCodec, audioCodec, audioChannelCount, audioSampleRate, videoBitrate: 9e6, outputFormat: OutputFormat.MP4 };
        if (data) {
            config = Object.assign({}, config, data);
        }
        // this.outputFormat = config.outputFormat;


        this.outputFormat = config.outputFormat;

        this._recordConfig = config;
    }


    createMuxer() {
        let { canvas, outputFormat } = this;

        let recordConfig = this.getRecordConfig();
        let { audioChannelCount, audioCodec, videoBitrate, videoCodec, audioSampleRate } = recordConfig;

        let audioTrack = '';
        try {
            const stream = this.player.meidiaEl.captureStream();
            audioTrack = stream.getAudioTracks()[0];
        } catch (e) {
            console.error(e);
        }

        let muxerVideoCodec = '';
        let muxerAudioCodec = '';
        let encodeVideoCodec = '';
        let encodeAudioCodec = '';
        let audioBitrate: number;
        if (outputFormat === OutputFormat.WebM) {
            muxerVideoCodec = 'V_VP9';
            muxerAudioCodec = 'A_OPUS';
            encodeVideoCodec = 'vp09.00.10.08';
            encodeAudioCodec = 'opus';
            audioBitrate = 64000;
            this.muxer = new MuxerWebm({
                target: new ArrayBufferTargetWebm(),
                video: {
                    codec: muxerVideoCodec,
                    width: canvas.width,
                    height: canvas.height,
                    frameRate: 30,
                },
                audio: audioTrack ? {
                    codec: muxerAudioCodec,
                    sampleRate: audioSampleRate,
                    numberOfChannels: 1,
                } : undefined,
                firstTimestampBehavior: 'offset', // Because we're directly piping a MediaStreamTrack's data into it
            });
        }
        let $this = this;
        if (outputFormat === OutputFormat.MP4) {
            muxerVideoCodec = 'avc';
            muxerAudioCodec = 'aac';
            encodeVideoCodec = 'avc1.4d002a';
            encodeAudioCodec = 'mp4a.40.2';
            audioBitrate = 128000;
            this.muxer = new MuxerMp4({
                target: new ArrayBufferTargetMp4(),
                video: $this.player.config.showAudio != true ? {
                    codec: 'avc',
                    width: canvas.width,
                    height: canvas.height,
                } : undefined,
                audio: audioTrack ? {
                    codec: 'aac',
                    sampleRate: audioSampleRate,
                    numberOfChannels: 1,
                } : undefined,
                firstTimestampBehavior: 'offset', // Because we're directly piping a MediaStreamTrack's data into it
            });
        }


        let { muxer } = this;


        this.videoEncoder = new VideoEncoder({
            // output: (chunk, meta) => {},
            output: (chunk, meta) => {
                if ($this.player.config.showAudio != true) {
                    return muxer.addVideoChunk(chunk, meta);
                }
            },
            error: e => console.error(e),
        });


        this.videoEncoder.configure({
            codec: videoCodec,
            width: canvas.width,
            height: canvas.height,
            bitrate: videoBitrate,
        });

        if (this.player.mpegtsPlayer.audioPlayer) {
            this.audioEncoder = new AudioEncoder({
                output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
                error: (e) => {
                   console.error(e);
                },
            });

            this.audioEncoder.configure({
                codec: 'opus',
                numberOfChannels: 1,
                sampleRate: 8000,
                bitrate: audioBitrate,
            });

            let { audioEncoder, recording } = this;

            this.player.mpegtsPlayer.on('audio_segment', (audioData) => {
                 if (audioData.length > 0) {
                    let elapsedTime = document.timeline.currentTime - this.startTime;
                    // const init = {
                    //     type: 'key',
                    //     data: audioData.buffer,
                    //     timestamp: 23000000,
                    //   };
                    // let chunk = new EncodedAudioChunk(init);
                    let audioData1 = new AudioData({
                        data: audioData.buffer, // arraybuffer  pcm
                        format: 'f32',
                        numberOfChannels: 1, // 通道
                        timestamp: elapsedTime * 1000,
                        sampleRate: 8000, // 音頻采樣率
                        numberOfFrames: 10,
                    });
                    audioEncoder.encode(audioData1);
                    audioData1.close();
                    audioData1 = null;
                 }


                // audioEncoder.encode(audioData);
            });
        }

        if (audioTrack) {
            this.audioEncoder = new AudioEncoder({
                output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
                error: (e) => {
                   console.error(e);
                },
            });
            this.audioEncoder.configure({
                codec: audioCodec,
                numberOfChannels: audioChannelCount,
                sampleRate: audioSampleRate,
                bitrate: audioBitrate,
            });

            // let h = this.player.audioProcessingService.context.audioContext.sampleRate;
            // let pp = this.player.audioProcessingService.context.audioSourceNode.channelCount;
            // debugger;

            const trackProcessor = new MediaStreamTrackProcessor({ track: audioTrack });
            const reader = trackProcessor.readable.getReader();

            let { audioEncoder, recording } = this;

            reader.read().then(function process({ done, value }) {
                if (done || recording === false) return;

                // let { numberOfChannels, sampleRate } = value;


                audioEncoder.encode(value);
                value.close();

                reader.read().then(process);
                });
            // Create a MediaStreamTrackProcessor to get AudioData chunks from the audio track
            // let trackProcessor = new MediaStreamTrackProcessor({ track: audioTrack });
            // let $this = this;
            // let consumer = new WritableStream({
            //     write(audioData) {
            //         if (!$this.recording) return;
            //         $this.audioEncoder.encode(audioData);
            //         audioData.close();
            //     },
            // });
            // trackProcessor.readable.pipeTo(consumer);
        }
    }

    async startRecord(parm?: {}) {
        // this.getRecordConfig();

        this.setRecordConfig(parm);

        this.setCanvas();
        this.recording = true;

        if (typeof VideoEncoder === 'undefined') {
            alert('no Support  VideoEncoder / WebCodecs API  use Https');
            return;
        }


        this.createMuxer();

        this.startTime = document.timeline.currentTime;
        this.recording = true;
        this.lastKeyFrame = -Infinity;
        let { startTime, canvas, lastKeyFrame, videoEncoder } = this;
        let $this = this;


        const encodeVideoFrame = () => {
            let elapsedTime = document.timeline.currentTime - startTime;
            let frame = new VideoFrame(canvas, {
                timestamp: elapsedTime * 1000,
            });

            // Ensure a video key frame at least every 10 seconds
            let needsKeyFrame = elapsedTime - lastKeyFrame >= 10000;
            if (needsKeyFrame) lastKeyFrame = elapsedTime;


        //  frame 一定 必须  must be  close
            videoEncoder.encode(frame, { keyFrame: needsKeyFrame });

            frame.close();
           let recordTextContent = `${elapsedTime % 1000 < 500 ? '🔴' : '⚫'} Recording - ${(elapsedTime / 1000).toFixed(1)} s`;
           $this.player.emit('recordTextContent', recordTextContent);
        };

         encodeVideoFrame();

        this.intervalId = setInterval(encodeVideoFrame, 1000 / 30);
    }
    // encodeVideoFrame() {
    //     let { canvas, lastKeyFrame, videoEncoder } = this;


    //     let elapsedTime = Number(document.timeline.currentTime) - Number(this.startTime);
    //     let frame = new VideoFrame(canvas, {
    //         timestamp: elapsedTime * 1000,
    //     });

    //             // Ensure a video key frame at least every 10 seconds
    //     let needsKeyFrame = elapsedTime - lastKeyFrame >= 10000;
    //     if (needsKeyFrame) lastKeyFrame = elapsedTime;


    //     videoEncoder.encode(frame, { keyFrame: needsKeyFrame });

    //     // 很重要 frame 一定要close
    //     frame.close();

    //     this.recordTextContent = `${elapsedTime % 1000 < 500 ? '🔴' : '⚫'} Recording - ${(elapsedTime / 1000).toFixed(1)} s`;
    //     this.player.emit('recordTextContent', this.recordTextContent);
    // }
    async endRecording() {
        this.recordTextContent = '';
        this.recording = false;

        clearInterval(this.intervalId);

        this.audioTrack?.stop();

        await this.videoEncoder.flush();

        // 可能 没有音频
        if (this.audioEncoder) {
            await this.audioEncoder.flush();
        }
        this.muxer.finalize();

        let { buffer } = this.muxer.target;

        this.downloadBlob(new Blob([buffer]));
    }

    downloadBlob(blob: Blob) {
        let url = window.URL.createObjectURL(blob);
        let a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        let name = '';
        switch (this.outputFormat) {
            case OutputFormat.MP4:
                name = 'picasso.mp4';
                break;
            case OutputFormat.WebM:
                name = 'picasso.webm';
                break;
            default:
                console.log('- none--');
        }
        a.download = name;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
    }
}


export default canvasToVideo;