/*
 * Copyright (C) 2016 Bilibili. All Rights Reserved.
 *
 * @author zheng qian <xqq@xqq.im>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import EventEmitter from 'events';
import Log from '../utils/logger.js';
import Browser from '../utils/browser.js';
import PlayerEvents from './player-events.js';
import Transmuxer from '../core/transmuxer.js';
import TransmuxingEvents from '../core/transmuxing-events.js';
//import MSEController from '../core/mse-controller.js';
import MSEController from '../core/new-mse-controller.ts';
import MSEEvents from '../core/mse-events.js';
import {ErrorTypes, ErrorDetails} from './player-errors.js';
import {createDefaultConfig} from '../config.js';
import {InvalidArgumentException, IllegalStateException} from '../utils/exception.js';

import PCMPlayer from './audioContextPlayer.js';

class MSEPlayer {

    constructor(mediaDataSource, config) {
        this.TAG = 'MSEPlayer';
        this._type = 'MSEPlayer';
        this._emitter = new EventEmitter();
        this._destroyed = false;
        this._attachmentId = 0;
        this._loadId = 0;
        this._reloadRequest = null;
        this._seekTimer = null;
        this._errorListenerEnabled = false;
        this._audioMeidaElement = null;
        this._msectl_audio = null;
        this.splitAVBuffers= mediaDataSource.splitAVBuffers||false

       

        this._config = createDefaultConfig();
        if (typeof config === 'object') {
            Object.assign(this._config, config);
        }

        let typeLowerCase = mediaDataSource.type.toLowerCase();
        if (typeLowerCase !== 'mse'
                && typeLowerCase !== 'mpegts'
                && typeLowerCase !== 'm2ts'
                && typeLowerCase !== 'flv') {
            throw new InvalidArgumentException('MSEPlayer requires an mpegts/m2ts/flv MediaDataSource input!');
        }

        if (mediaDataSource.isLive === true) {
            this._config.isLive = true;
        }

        this.e = null;

        if (self.performance && self.performance.now) {
            this._now = self.performance.now.bind(self.performance);
        } else {
            this._now = Date.now;
        }

        this._pendingSeekTime = null;  // in seconds
        this._requestSetTime = false;
        this._seekpointRecord = null;
        this._progressChecker = null;

        this._mediaDataSource = mediaDataSource;
        this._mediaElement = null;
        this._msectl = null;
        this._transmuxer = null;

        this._mseSourceOpened = false;
        this._hasPendingLoad = false;
        this._receivedCanPlay = false;

        this._mediaInfo = null;
        this._statisticsInfo = null;

        let chromeNeedIDRFix = (Browser.chrome &&
                               (Browser.version.major < 50 ||
                               (Browser.version.major === 50 && Browser.version.build < 2661)));
        this._alwaysSeekKeyframe = (chromeNeedIDRFix || Browser.msedge || Browser.msie) ? true : false;

        if (this._alwaysSeekKeyframe) {
            this._config.accurateSeek = false;
        }
    }

    initAudioPlayer(){
        this._assertNotDestroyed();
        if (this.audioPlayer) return;

        // this.audioPlayer=new PCMPlayer({
        //     encoding: '16bitInt',
        //     channels: 1,
        //     sampleRate: 8000,
        //     flushingTime: 200
        // });


        // this.audioPlayer=new  PCMPlayer()
        // this.audioPlayer.init({sampleRate:8000})
        this.audioPlayer= new PCMPlayer();

        // 初始化音频播放配置
        this.audioPlayer.init({
            sampleRate: 8000,  // μ-law PCM 通常是 8000 Hz
            bufferSize: 1024,  // 缓冲大小，可根据需要调整
            numberOfOutputChannels: 1,  // 单声道
            isLive: true,  // 是否实时播放
        }); 
        
        
    }

    _assertNotDestroyed() {
        if (this._destroyed) {
            throw new IllegalStateException('MSEPlayer has been destroyed!');
        }
    }

    _cancelPendingTasks() {
        this._reloadRequest = null;
        this._hasPendingLoad = false;
        this._pendingSeekTime = null;
        this._seekpointRecord = null;
        this._requestSetTime = false;
        window.clearTimeout(this._seekTimer);
        this._seekTimer = null;
        window.clearInterval(this._progressChecker);
        this._progressChecker = null;
    }

    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        // Set the flag before notifying callers, including reentrant destroy().
        try {
            this._emitter.emit(PlayerEvents.DESTROYING);
        } finally {
            this.detachMediaElement();
            if (this.audioPlayer) {
                const context = this.audioPlayer.audioContext;
                this.audioPlayer.destroy();
                this.audioPlayer = null;
                if (context && context.state !== 'closed') {
                    context.close().catch(error => Log.w(this.TAG, error.message));
                }
            }
            this.e = null;
            this._mediaDataSource = null;
            this._emitter.removeAllListeners();
            this._emitter = null;
        }
    }

    on(event, listener) {
        this._assertNotDestroyed();
        this._emitter.addListener(event, listener);
        const hasSnapshot = (event === PlayerEvents.MEDIA_INFO && this._mediaInfo != null)
            || (event === PlayerEvents.STATISTICS_INFO && this._statisticsInfo != null);
        if (hasSnapshot) {
            const loadId = this._loadId;
            const snapshot = event === PlayerEvents.MEDIA_INFO ? this.mediaInfo : this.statisticsInfo;
            Promise.resolve().then(() => {
                if (!this._destroyed && loadId === this._loadId
                        && this._emitter.listeners(event).includes(listener)) {
                    // Only the new subscriber needs the cached value.
                    listener.call(this._emitter, snapshot);
                }
            });
        }
    }

    off(event, listener) {
        if (this._emitter) this._emitter.removeListener(event, listener);
    }

    attachMediaElement(mediaElement, audioMeidaElement) {
        this._assertNotDestroyed();
        if (!mediaElement) {
            throw new InvalidArgumentException('HTMLMediaElement is required!');
        }
        if (this._mediaElement) {
            if (this._mediaElement === mediaElement
                    && this._audioMeidaElement === (this.splitAVBuffers ? audioMeidaElement || null : null)) return;
            throw new IllegalStateException('Detach the current HTMLMediaElement before attaching another!');
        }
        this._mediaElement = mediaElement;
        this._audioMeidaElement = this.splitAVBuffers ? audioMeidaElement || null : null;
        this._mseSourceOpened = false;
        this._receivedCanPlay = false;
        const attachmentId = ++this._attachmentId;
        // A queued callback from a detached MSE must not touch the new session.
        const bind = handler => (...args) => {
            if (!this._destroyed && attachmentId === this._attachmentId) {
                return handler(...args);
            }
        };
        this.e = {
            onvLoadedMetadata: bind(this._onvLoadedMetadata.bind(this)),
            onvSeeking: bind(this._onvSeeking.bind(this)),
            onvCanPlay: bind(this._onvCanPlay.bind(this)),
            onvStalled: bind(this._onvStalled.bind(this)),
            onvProgress: bind(this._onvProgress.bind(this)),
            onvError: bind(this._onvError.bind(this))
        };
        mediaElement.addEventListener('loadedmetadata', this.e.onvLoadedMetadata);
        mediaElement.addEventListener('seeking', this.e.onvSeeking);
        mediaElement.addEventListener('canplay', this.e.onvCanPlay);
        mediaElement.addEventListener('stalled', this.e.onvStalled);
        mediaElement.addEventListener('progress', this.e.onvProgress);
        if (this._errorListenerEnabled) mediaElement.addEventListener('error', this.e.onvError);
        const onMSE = (controller, event, handler) => controller.on(event, bind(handler));

        this._msectl = new MSEController(this._config);
        //  在創建一個 _msectl 獨立消費音頻track
        // debugger
        if(this.splitAVBuffers===true){
            this._msectl_audio=new MSEController(this._config);
        }

        onMSE(this._msectl, MSEEvents.UPDATE_END, this._onmseUpdateEnd.bind(this));
        if(this.splitAVBuffers===true&&this._msectl_audio){
            onMSE(this._msectl_audio, MSEEvents.UPDATE_END, ()=>{
                if (!this._transmuxer || !this._audioMeidaElement) return;
                let buffered = this._audioMeidaElement.buffered;
                let currentTime = this._audioMeidaElement.currentTime;
                if (this._config.isLive
                    && this._config.liveBufferLatencyChasing
                    && buffered.length > 0
                    && !this._audioMeidaElement.paused){
                        let buffered_end = buffered.end(buffered.length - 1);
                        if (buffered_end - currentTime > this._config.liveBufferLatencyMaxLatency) {
                            // if remained data duration has larger than config.liveBufferLatencyMaxLatency
                            let target_time = Math.max(buffered.start(buffered.length - 1),
                                Math.min(buffered_end - 0.001, buffered_end - this._config.liveBufferLatencyMinRemain));
                            this._audioMeidaElement.currentTime= target_time;
                          
                        }
    
    
                    }
        
            
            });

        }


        if(this.splitAVBuffers===true&&this._msectl_audio){
            onMSE(this._msectl_audio, MSEEvents.BUFFER_FULL, ()=>{
                Log.v(this.TAG, 'MSE SourceBuffer is full, suspend transmuxing task');
                if (this._progressChecker == null) {
                    this._suspendTransmuxer();
                }
    
            });

        }
    

        onMSE(this._msectl, MSEEvents.BUFFER_FULL, this._onmseBufferFull.bind(this));
        onMSE(this._msectl, MSEEvents.SOURCE_OPEN, () => {
            this._mseSourceOpened = true;
            const reloadRequest = this._reloadRequest;
            if (this._hasPendingLoad) {
                this._hasPendingLoad = false;
                this.load();
            }
            if (reloadRequest && this._reloadRequest === reloadRequest && this._transmuxer) {
                this._reloadRequest = null;
                if (reloadRequest.play) this._playAfterReload();
            }
        });
        onMSE(this._msectl, MSEEvents.ERROR, (info) => {
            this._emitter.emit(PlayerEvents.ERROR,
                               ErrorTypes.MEDIA_ERROR,
                               ErrorDetails.MEDIA_MSE_ERROR,
                               info
            );
        });

        this._msectl.attachMediaElement(mediaElement);

        if(this._audioMeidaElement&&this.splitAVBuffers===true){
            this._msectl_audio.attachMediaElement(audioMeidaElement) 
        }

    

        if (this._pendingSeekTime != null) {
            try {
                mediaElement.currentTime = this._pendingSeekTime;
                this._pendingSeekTime = null;
            } catch (e) {
                // IE11 may throw InvalidStateError if readyState === 0
                // We can defer set currentTime operation after loadedmetadata
            }
        }
    }

    detachMediaElement() {
        ++this._attachmentId;
        this.unload();
        if (this._mediaElement && this.e) {
            this._mediaElement.removeEventListener('loadedmetadata', this.e.onvLoadedMetadata);
            this._mediaElement.removeEventListener('seeking', this.e.onvSeeking);
            this._mediaElement.removeEventListener('canplay', this.e.onvCanPlay);
            this._mediaElement.removeEventListener('stalled', this.e.onvStalled);
            this._mediaElement.removeEventListener('progress', this.e.onvProgress);
            this._mediaElement.removeEventListener('error', this.e.onvError);
        }
        if (this._msectl) {
            this._msectl.destroy();
            this._msectl = null;
        }
        if (this._msectl_audio) {
            this._msectl_audio.destroy();
            this._msectl_audio = null;
        }
        this._mediaElement = null;
        this._audioMeidaElement = null;
        this.e = null;
        this._mseSourceOpened = false;
        this._receivedCanPlay = false;
    }

    load() {
        this._assertNotDestroyed();
        if (!this._mediaElement) {
            throw new IllegalStateException('HTMLMediaElement must be attached before load()!');
        }
        if (this._transmuxer) {
            throw new IllegalStateException('MSEPlayer.load() has been called, please call unload() first!');
        }
        if (this._hasPendingLoad) {
            return;
        }

        if (this._config.deferLoadAfterSourceOpen && this._mseSourceOpened === false) {
            this._hasPendingLoad = true;
            return;
        }

        if (this._mediaElement.readyState > 0) {
            this._requestSetTime = true;
            // IE11 may throw InvalidStateError if readyState === 0
            this._mediaElement.currentTime = 0;
        }

        this._receivedCanPlay = false;
        this._mediaElement.addEventListener('canplay', this.e.onvCanPlay);
        this._mediaElement.addEventListener('progress', this.e.onvProgress);
        const loadId = ++this._loadId;
        const transmuxer = this._transmuxer = new Transmuxer(this._mediaDataSource, this._config);
        const onTransmuxer = (event, handler) => transmuxer.on(event, (...args) => {
            if (!this._destroyed && this._loadId === loadId && this._transmuxer === transmuxer) {
                handler(...args);
            }
        });

        onTransmuxer(TransmuxingEvents.INIT_SEGMENT, (type, is) => {
           
            if(type==='audio'&this.splitAVBuffers===true){
            
              this._msectl_audio.appendInitSegment(is)
            }else{
                this._msectl.appendInitSegment(is);
            }
           // this._msectl.appendInitSegment(is);
        });
        onTransmuxer(TransmuxingEvents.AUDIO_SEGMENT, (type, audioBuffer, info) => {

     

         /*    if(!!this.audioPlayer==false){
                this.initAudioPlayer()
            }


            const pcmDataBuffer = audioBuffer;

            // 使用 ArrayBuffer 创建新的 Int16Array 视图
            const pcmData = new Int16Array(pcmDataBuffer);
        
            // 转换 Int16Array 到 Float32Array
            const floatData = new Float32Array(pcmData.length);
            for (let i = 0; i < pcmData.length; i++) {
                // 将 PCM 数据从 Int16 转换为 Float32
                floatData[i] = pcmData[i] / 32768;  // PCM 数据的范围是 -32768 到 32767
            }
          this.audioPlayer.feedPCMDataBeta(floatData) */
          

           this._emitter.emit("audio_segment", audioBuffer, info);
            
         

        })
        onTransmuxer(TransmuxingEvents.MEDIA_SEGMENT, (type, ms) => {


            if(type==="audio"&&this.splitAVBuffers===true){
               
                this._msectl_audio.appendMediaSegment(ms)
            }else{
               
                this._msectl.appendMediaSegment(ms);
            }
         //debugger
          

            // lazyLoad check
            if (this._config.lazyLoad && !this._config.isLive) {
                let currentTime = this._mediaElement.currentTime;
                if (ms.info.endDts >= (currentTime + this._config.lazyLoadMaxDuration) * 1000) {
                    if (this._progressChecker == null) {
                        Log.v(this.TAG, 'Maximum buffering duration exceeded, suspend transmuxing task');
                        this._suspendTransmuxer();
                    }
                }
            }
        });
        onTransmuxer(TransmuxingEvents.LOADING_COMPLETE, () => {
            this._msectl.endOfStream();
            this._emitter.emit(PlayerEvents.LOADING_COMPLETE);
        });
        onTransmuxer(TransmuxingEvents.RECOVERED_EARLY_EOF, () => {
            this._emitter.emit(PlayerEvents.RECOVERED_EARLY_EOF);
        });
        onTransmuxer(TransmuxingEvents.IO_ERROR, (detail, info) => {
            this._emitter.emit(PlayerEvents.ERROR, ErrorTypes.NETWORK_ERROR, detail, info);
        });
        onTransmuxer(TransmuxingEvents.DEMUX_ERROR, (detail, info) => {
            //debugger
            this._emitter.emit(PlayerEvents.ERROR, ErrorTypes.MEDIA_ERROR, detail, {code: -1, msg: info});
        });
        onTransmuxer(TransmuxingEvents.MEDIA_INFO, (mediaInfo) => {
            this._mediaInfo = mediaInfo;
            //debugger
            this._emitter.emit(PlayerEvents.MEDIA_INFO, Object.assign({}, mediaInfo));
        });
        onTransmuxer(TransmuxingEvents.METADATA_ARRIVED, (metadata) => {
            //debugger
            this._emitter.emit(PlayerEvents.METADATA_ARRIVED, metadata);
        });
        onTransmuxer(TransmuxingEvents.SCRIPTDATA_ARRIVED, (data) => {
            this._emitter.emit(PlayerEvents.SCRIPTDATA_ARRIVED, data);
        });
        onTransmuxer(TransmuxingEvents.TIMED_ID3_METADATA_ARRIVED, (timed_id3_metadata) => {
            this._emitter.emit(PlayerEvents.TIMED_ID3_METADATA_ARRIVED, timed_id3_metadata);
        });
        onTransmuxer(TransmuxingEvents.SMPTE2038_METADATA_ARRIVED, (smpte2038_metadata) => {
            this._emitter.emit(PlayerEvents.SMPTE2038_METADATA_ARRIVED, smpte2038_metadata);
        });
        onTransmuxer(TransmuxingEvents.SCTE35_METADATA_ARRIVED, (scte35_metadata) => {
            this._emitter.emit(PlayerEvents.SCTE35_METADATA_ARRIVED, scte35_metadata);
        });
        onTransmuxer(TransmuxingEvents.PES_PRIVATE_DATA_DESCRIPTOR, (descriptor) => {
            this._emitter.emit(PlayerEvents.PES_PRIVATE_DATA_DESCRIPTOR, descriptor);
        });
        onTransmuxer(TransmuxingEvents.PES_PRIVATE_DATA_ARRIVED, (private_data) => {
            this._emitter.emit(PlayerEvents.PES_PRIVATE_DATA_ARRIVED, private_data);
        });
        onTransmuxer(TransmuxingEvents.STATISTICS_INFO, (statInfo) => {
            this._statisticsInfo = this._fillStatisticsInfo(statInfo);
            this._emitter.emit(PlayerEvents.STATISTICS_INFO, Object.assign({}, this._statisticsInfo));
        });
        onTransmuxer(TransmuxingEvents.RECOMMEND_SEEKPOINT, (milliseconds) => {
            if (this._mediaElement && !this._config.accurateSeek) {
                this._requestSetTime = true;
                this._mediaElement.currentTime = milliseconds / 1000;
            }
        });

        this._transmuxer.open();
    }

    unload() {
        ++this._loadId;
        this._cancelPendingTasks();
        this._mediaInfo = null;
        this._statisticsInfo = null;
        const transmuxer = this._transmuxer;
        this._transmuxer = null;
        if (transmuxer) {
            transmuxer.close();
            transmuxer.destroy();
        }
        if (this._mediaElement) this._mediaElement.pause();
        if (this._audioMeidaElement) this._audioMeidaElement.pause();
        if (this._msectl) this._msectl.seek(0);
        if (this._msectl_audio) this._msectl_audio.seek(0);
    }

    deCodeError() {
        this.safeReolad();
    }

    reload() {
        this._assertNotDestroyed();
        const video = this._mediaElement;
        const audio = this._audioMeidaElement;
        if (!video) {
            throw new IllegalStateException('HTMLMediaElement must be attached before reload()!');
        }
        this.detachMediaElement();
        this.attachMediaElement(video, audio);
        // Preserve reload's automatic playback, but wait for this attachment's sourceopen.
        this._reloadRequest = {play: true};
        this._hasPendingLoad = true;
    }

    safeReolad() {
        // Keep the existing public spelling as an alias.
        this.reload();
    }

    _playAfterReload() {
        const loadId = this._loadId;
        for (const media of [this._mediaElement, this._audioMeidaElement]) {
            if (!media) continue;
            const result = media.play();
            if (result && typeof result.catch === 'function') {
                result.catch(error => {
                    if (!this._destroyed && loadId === this._loadId) {
                        Log.w(this.TAG, `Unable to resume after reload: ${error.message}`);
                    }
                });
            }
        }
    }

    defatulEvent() {
        this._assertNotDestroyed();
        // Error recovery remains opt-in; repeated calls register the same handler.
        this._errorListenerEnabled = true;
        if (this._mediaElement) this._mediaElement.addEventListener('error', this.e.onvError);
    }

    _onvError(event) {
        if (!this._transmuxer && !this._hasPendingLoad) return;
        const error = event.target.error;
        if (!error) return;
        Log.e(this.TAG, `Media element error ${error.code}: ${error.message || ''}`);
        if (error.code === 3) this.deCodeError();
    }

    play() {
        this._assertNotDestroyed();
        if (this._reloadRequest) this._reloadRequest.play = true;
        if (this.splitAVBuffers === true && this._audioMeidaElement) {
            this._playMediaElement(this._audioMeidaElement);
        }
        return this._playMediaElement(this._mediaElement);
    }

    _playMediaElement(media) {
        const attachmentId = this._attachmentId;
        const result = media.play();
        if (result && typeof result.catch === 'function') {
            // Own both play requests. A detach/pause can interrupt either while
            // it waits for data; the auxiliary audio promise has no public caller.
            result.catch(error => {
                if (!this._destroyed && attachmentId === this._attachmentId && error.name !== 'AbortError') {
                    Log.w(this.TAG, `Unable to play media: ${error.message}`);
                }
            });
        }
        // Preserve the original promise so callers can still observe rejection.
        return result;
    }

    pause() {
        if (this._reloadRequest) this._reloadRequest.play = false;
        if (this._mediaElement) this._mediaElement.pause();
        if (this._audioMeidaElement) this._audioMeidaElement.pause();
    }

    get type() {
        return this._type;
    }

    get buffered() {
        return this._mediaElement.buffered;
    }

    get duration() {
        return this._mediaElement.duration;
    }

    get volume() {
        return this._mediaElement.volume;
    }

    set volume(value) {
        this._mediaElement.volume = value;
    }

    get muted() {
        return this._mediaElement.muted;
    }

    set muted(muted) {
        this._mediaElement.muted = muted;
        if(this.splitAVBuffers===true&&this._audioMeidaElement){
            this._audioMeidaElement.muted=muted

        }
    }

    get currentTime() {
        if (this._mediaElement) {
            return this._mediaElement.currentTime;
        }
        return 0;
    }

    set currentTime(seconds) {
        if (this._mediaElement) {
            this._internalSeek(seconds);
        } else {
            this._pendingSeekTime = seconds;
        }
    }

    get mediaInfo() {
        return Object.assign({}, this._mediaInfo);
    }

    get statisticsInfo() {
        if (this._statisticsInfo == null) {
            this._statisticsInfo = {};
        }
        this._statisticsInfo = this._fillStatisticsInfo(this._statisticsInfo);
        return Object.assign({}, this._statisticsInfo);
    }

    _fillStatisticsInfo(statInfo) {
        statInfo.playerType = this._type;

        if (!(this._mediaElement instanceof HTMLVideoElement)) {
            return statInfo;
        }

        let hasQualityInfo = true;
        let decoded = 0;
        let dropped = 0;

        if (this._mediaElement.getVideoPlaybackQuality) {
            let quality = this._mediaElement.getVideoPlaybackQuality();
            decoded = quality.totalVideoFrames;
            dropped = quality.droppedVideoFrames;
        } else if (this._mediaElement.webkitDecodedFrameCount != undefined) {
            decoded = this._mediaElement.webkitDecodedFrameCount;
            dropped = this._mediaElement.webkitDroppedFrameCount;
        } else {
            hasQualityInfo = false;
        }

        if (hasQualityInfo) {
            statInfo.decodedFrames = decoded;
            statInfo.droppedFrames = dropped;
        }

        return statInfo;
    }

    _onmseUpdateEnd() {
        if (this._destroyed || !this._mediaElement || !this._transmuxer) return;
        let buffered = this._mediaElement.buffered;
        let currentTime = this._mediaElement.currentTime;

        if (this._config.isLive
                && this._config.liveBufferLatencyChasing
                && buffered.length > 0
                && !this._mediaElement.paused) {
            let buffered_end = buffered.end(buffered.length - 1);
            if (buffered_end > this._config.liveBufferLatencyMaxLatency) {
                // Ensure there's enough buffered data
                if (buffered_end - currentTime > this._config.liveBufferLatencyMaxLatency) {
                    // if remained data duration has larger than config.liveBufferLatencyMaxLatency
                    // The first usable GOP may begin well after zero, with less
                    // than MinRemain buffered. Never chase into the preceding gap:
                    // _internalSeek would clear MSE and request a network seek.
                    let target_time = Math.max(buffered.start(buffered.length - 1),
                        Math.min(buffered_end - 0.001, buffered_end - this._config.liveBufferLatencyMinRemain));
                    this.currentTime = target_time;
                }
            }
        }

        if (!this._config.lazyLoad || this._config.isLive) {
            return;
        }

        let currentRangeStart = 0;
        let currentRangeEnd = 0;

        for (let i = 0; i < buffered.length; i++) {
            let start = buffered.start(i);
            let end = buffered.end(i);
            if (start <= currentTime && currentTime < end) {
                currentRangeStart = start;
                currentRangeEnd = end;
                break;
            }
        }

        if (currentRangeEnd >= currentTime + this._config.lazyLoadMaxDuration && this._progressChecker == null) {
            Log.v(this.TAG, 'Maximum buffering duration exceeded, suspend transmuxing task');
            this._suspendTransmuxer();
        }
    }

    _onmseBufferFull() {
        Log.v(this.TAG, 'MSE SourceBuffer is full, suspend transmuxing task');
        if (this._progressChecker == null) {
            this._suspendTransmuxer();
        }
    }

    _suspendTransmuxer() {
        if (this._transmuxer) {
            this._transmuxer.pause();

            if (this._progressChecker == null) {
                const loadId = this._loadId;
                this._progressChecker = window.setInterval(() => {
                    if (!this._destroyed && loadId === this._loadId) this._checkProgressAndResume();
                }, 1000);
            }
        }
    }

    _checkProgressAndResume() {
        if (this._destroyed || !this._mediaElement || !this._transmuxer) return;
        let currentTime = this._mediaElement.currentTime;
        let buffered = this._mediaElement.buffered;

        let needResume = false;

        for (let i = 0; i < buffered.length; i++) {
            let from = buffered.start(i);
            let to = buffered.end(i);
            if (currentTime >= from && currentTime < to) {
                if (currentTime >= to - this._config.lazyLoadRecoverDuration) {
                    needResume = true;
                }
                break;
            }
        }

        if (needResume) {
            window.clearInterval(this._progressChecker);
            this._progressChecker = null;
            if (needResume) {
                Log.v(this.TAG, 'Continue loading from paused position');
                this._transmuxer.resume();
            }
        }
    }

    _isTimepointBuffered(seconds) {
        let buffered = this._mediaElement.buffered;

        for (let i = 0; i < buffered.length; i++) {
            let from = buffered.start(i);
            let to = buffered.end(i);
            if (seconds >= from && seconds < to) {
                return true;
            }
        }
        return false;
    }

    _internalSeek(seconds) {
        if (!this._transmuxer) {
            this._pendingSeekTime = seconds;
            return;
        }
        let directSeek = this._isTimepointBuffered(seconds);

        let directSeekBegin = false;
        let directSeekBeginTime = 0;

        if (seconds < 1.0 && this._mediaElement.buffered.length > 0) {
            let videoBeginTime = this._mediaElement.buffered.start(0);
            if ((videoBeginTime < 1.0 && seconds < videoBeginTime) || Browser.safari) {
                directSeekBegin = true;
                // also workaround for Safari: Seek to 0 may cause video stuck, use 0.1 to avoid
                directSeekBeginTime = Browser.safari ? 0.1 : videoBeginTime;
            }
        }

        if (directSeekBegin) {  // seek to video begin, set currentTime directly if beginPTS buffered
            this._requestSetTime = true;
            this._mediaElement.currentTime = directSeekBeginTime;
        }  else if (directSeek) {  // buffered position
            if (!this._alwaysSeekKeyframe) {
                this._requestSetTime = true;
                this._mediaElement.currentTime = seconds;
            } else {
                let idr = this._msectl.getNearestKeyframe(Math.floor(seconds * 1000));
                this._requestSetTime = true;
                if (idr != null) {
                    this._mediaElement.currentTime = idr.dts / 1000;
                } else {
                    this._mediaElement.currentTime = seconds;
                }
            }
            if (this._progressChecker != null) {
                this._checkProgressAndResume();
            }
        } else {
            if (this._progressChecker != null) {
                window.clearInterval(this._progressChecker);
                this._progressChecker = null;
            }
            this._msectl.seek(seconds);
            this._transmuxer.seek(Math.floor(seconds * 1000));  // in milliseconds
            // no need to set mediaElement.currentTime if non-accurateSeek,
            // just wait for the recommend_seekpoint callback
            if (this._config.accurateSeek) {
                this._requestSetTime = true;
                this._mediaElement.currentTime = seconds;
            }
        }
    }

    _scheduleSeekCheck() {
        window.clearTimeout(this._seekTimer);
        const loadId = this._loadId;
        this._seekTimer = window.setTimeout(() => {
            if (this._destroyed || loadId !== this._loadId) return;
            this._seekTimer = null;
            this._checkAndApplyUnbufferedSeekpoint();
        }, 50);
    }

    _checkAndApplyUnbufferedSeekpoint() {
        if (this._destroyed || !this._mediaElement || !this._transmuxer) return;
        if (this._seekpointRecord) {
            if (this._seekpointRecord.recordTime <= this._now() - 100) {
                let target = this._mediaElement.currentTime;
                this._seekpointRecord = null;
                if (!this._isTimepointBuffered(target)) {
                    if (this._progressChecker != null) {
                        window.clearInterval(this._progressChecker);
                        this._progressChecker = null;
                    }
                    // .currentTime is consists with .buffered timestamp
                    // Chrome/Edge use DTS, while FireFox/Safari use PTS
                    this._msectl.seek(target);
                    this._transmuxer.seek(Math.floor(target * 1000));
                    // set currentTime if accurateSeek, or wait for recommend_seekpoint callback
                    if (this._config.accurateSeek) {
                        this._requestSetTime = true;
                        this._mediaElement.currentTime = target;
                    }
                }
            } else {
                this._scheduleSeekCheck();
            }
        }
    }

    _checkAndResumeStuckPlayback(stalled) {
        if (this._destroyed || !this._mediaElement || !this._transmuxer) return;
        let media = this._mediaElement;
        if (stalled || !this._receivedCanPlay || media.readyState < 2) {  // HAVE_CURRENT_DATA
            let buffered = media.buffered;
            if (buffered.length > 0 && media.currentTime < buffered.start(0)) {
                Log.w(this.TAG, `Playback seems stuck at ${media.currentTime}, seek to ${buffered.start(0)}`);
                this._requestSetTime = true;
                this._mediaElement.currentTime = buffered.start(0);
                this._mediaElement.removeEventListener('progress', this.e.onvProgress);
            }
        } else {
            // Playback didn't stuck, remove progress event listener
            this._mediaElement.removeEventListener('progress', this.e.onvProgress);
        }
    }

    _onvLoadedMetadata(e) {
        if (this._pendingSeekTime != null) {
            this._mediaElement.currentTime = this._pendingSeekTime;
            this._pendingSeekTime = null;
        }
    }

    _onvSeeking(e) {  // handle seeking request from browser's progress bar
        if (!this._transmuxer) return;
        let target = this._mediaElement.currentTime;
        let buffered = this._mediaElement.buffered;

        if (this._requestSetTime) {
            this._requestSetTime = false;
            return;
        }

        if (target < 1.0 && buffered.length > 0) {
            // seek to video begin, set currentTime directly if beginPTS buffered
            let videoBeginTime = buffered.start(0);
            if ((videoBeginTime < 1.0 && target < videoBeginTime) || Browser.safari) {
                this._requestSetTime = true;
                // also workaround for Safari: Seek to 0 may cause video stuck, use 0.1 to avoid
                this._mediaElement.currentTime = Browser.safari ? 0.1 : videoBeginTime;
                return;
            }
        }

        if (this._isTimepointBuffered(target)) {
            if (this._alwaysSeekKeyframe) {
                let idr = this._msectl.getNearestKeyframe(Math.floor(target * 1000));
                if (idr != null) {
                    this._requestSetTime = true;
                    this._mediaElement.currentTime = idr.dts / 1000;
                }
            }
            if (this._progressChecker != null) {
                this._checkProgressAndResume();
            }
            return;
        }

        this._seekpointRecord = {
            seekPoint: target,
            recordTime: this._now()
        };
        this._scheduleSeekCheck();
    }

    _onvCanPlay(e) {
        this._receivedCanPlay = true;
        this._mediaElement.removeEventListener('canplay', this.e.onvCanPlay);
    }

    _onvStalled(e) {
        this._checkAndResumeStuckPlayback(true);
    }

    _onvProgress(e) {
        this._checkAndResumeStuckPlayback();
    }

}

export default MSEPlayer;
