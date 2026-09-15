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
import TransmuxingWorker from './transmuxing-worker-entry.js?worker&inline';
import Log from '../utils/logger.js';
import LoggingControl from '../utils/logging-control.js';
import TransmuxingController from './transmuxing-controller.js';
import TransmuxingEvents from './transmuxing-events.js';
import MediaInfo from './media-info.js';
import {LoaderErrors} from '../io/loader.js';

class Transmuxer {

    constructor(mediaDataSource, config) {
        this.TAG = 'Transmuxer';
        this._emitter = new EventEmitter();
        this._mediaDataSource = mediaDataSource;
        this._config = config;
        this._worker = null;
        this._workerReady = false;
        this._workerPendingCommands = [];
        this._workerInitTimer = null;
        this._destroyed = false;

        if (config.enableWorker && typeof (Worker) !== 'undefined') {
            try {
                this._worker = new TransmuxingWorker();
                this._workerDestroying = false;
                this._worker.addEventListener('message', this._onWorkerMessage.bind(this));
                this._worker.addEventListener('error', this._onWorkerError.bind(this));
                this._worker.addEventListener('messageerror', this._onWorkerError.bind(this));
                this._workerInitTimer = setTimeout(() => {
                    this._onWorkerError({message: 'Worker initialization timed out'});
                }, 10000);
                // Blob workers have no usable base URL for relative media requests.
                const workerDataSource = Object.assign({}, mediaDataSource);
                const resolveURL = url => new URL(url, document.baseURI).href;
                if (workerDataSource.url) workerDataSource.url = resolveURL(workerDataSource.url);
                if (workerDataSource.segments) {
                    workerDataSource.segments = workerDataSource.segments.map(segment =>
                        Object.assign({}, segment, {url: resolveURL(segment.url)}));
                }
                this._worker.postMessage({cmd: 'init', param: [workerDataSource, config]});
                this.e = {
                    onLoggingConfigChanged: this._onLoggingConfigChanged.bind(this)
                };
                LoggingControl.registerListener(this.e.onLoggingConfigChanged);
                this._worker.postMessage({cmd: 'logging_config', param: LoggingControl.getConfig()});
            } catch (error) {
                Log.e(this.TAG, 'Error while initialize transmuxing worker, fallback to inline transmuxing');
                this._disposeWorker();
                this._initializeController();
            }
        } else {
            this._initializeController();
        }

    }

    _initializeController() {
        this._controller = new TransmuxingController(this._mediaDataSource, this._config);
        let ctl = this._controller;
        ctl.on(TransmuxingEvents.IO_ERROR, this._onIOError.bind(this));
        ctl.on(TransmuxingEvents.DEMUX_ERROR, this._onDemuxError.bind(this));
        ctl.on(TransmuxingEvents.INIT_SEGMENT, this._onInitSegment.bind(this));
        ctl.on(TransmuxingEvents.MEDIA_SEGMENT, this._onMediaSegment.bind(this));
        ctl.on(TransmuxingEvents.LOADING_COMPLETE, this._onLoadingComplete.bind(this));
        ctl.on(TransmuxingEvents.RECOVERED_EARLY_EOF, this._onRecoveredEarlyEof.bind(this));
        ctl.on(TransmuxingEvents.MEDIA_INFO, this._onMediaInfo.bind(this));
        ctl.on(TransmuxingEvents.METADATA_ARRIVED, this._onMetaDataArrived.bind(this));
        ctl.on(TransmuxingEvents.SCRIPTDATA_ARRIVED, this._onScriptDataArrived.bind(this));
        ctl.on(TransmuxingEvents.TIMED_ID3_METADATA_ARRIVED, this._onTimedID3MetadataArrived.bind(this));
        ctl.on(TransmuxingEvents.SMPTE2038_METADATA_ARRIVED, this._onSMPTE2038MetadataArrived.bind(this));
        ctl.on(TransmuxingEvents.SCTE35_METADATA_ARRIVED, this._onSCTE35MetadataArrived.bind(this));
        ctl.on(TransmuxingEvents.PES_PRIVATE_DATA_DESCRIPTOR, this._onPESPrivateDataDescriptor.bind(this));
        ctl.on(TransmuxingEvents.PES_PRIVATE_DATA_ARRIVED, this._onPESPrivateDataArrived.bind(this));
        ctl.on(TransmuxingEvents.STATISTICS_INFO, this._onStatisticsInfo.bind(this));
        ctl.on(TransmuxingEvents.RECOMMEND_SEEKPOINT, this._onRecommendSeekpoint.bind(this));
        ctl.on(TransmuxingEvents.AUDIO_SEGMENT, this._onAudioBuffer.bind(this));
    }

    _disposeWorker() {
        clearTimeout(this._workerInitTimer);
        this._workerInitTimer = null;
        if (this._worker) {
            this._worker.terminate();
            this._worker = null;
        }
        if (this.e) {
            LoggingControl.removeListener(this.e.onLoggingConfigChanged);
            this.e = null;
        }
    }

    _onWorkerError(event) {
        if (event.preventDefault) event.preventDefault();
        if (this._destroyed || !this._worker) return;
        const wasReady = this._workerReady;
        this._disposeWorker();
        if (wasReady) {
            // Restarting mid-stream could append duplicate media to MSE.
            this._emitter.emit(TransmuxingEvents.IO_ERROR, LoaderErrors.EXCEPTION, {
                code: -1, msg: event.message || 'Transmuxing worker failed'
            });
            return;
        }
        Log.e(this.TAG, 'Worker initialization failed, fallback to inline transmuxing');
        this._initializeController();
        const methods = {start: 'start', stop: 'stop', seek: 'seek', pause: 'pause', resume: 'resume'};
        const pending = this._workerPendingCommands;
        this._workerPendingCommands = [];
        for (const command of pending) {
            this._controller[methods[command.cmd]](command.param);
        }
    }

    _postWorkerCommand(command) {
        if (this._workerReady) {
            this._worker.postMessage(command);
        } else {
            this._workerPendingCommands.push(command);
        }
    }

    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        if (this._worker && this._workerReady) {
            this._workerDestroying = true;
            this._worker.postMessage({cmd: 'destroy'});
            LoggingControl.removeListener(this.e.onLoggingConfigChanged);
            this.e = null;
            this._workerInitTimer = setTimeout(() => this._disposeWorker(), 1000);
        } else {
            this._disposeWorker();
        }
        this._workerPendingCommands = [];
        if (this._controller) {
            this._controller.destroy();
            this._controller = null;
        }
        this._emitter.removeAllListeners();
        this._emitter = null;
        this._mediaDataSource = null;
        this._config = null;
    }

    on(event, listener) {
        this._emitter.addListener(event, listener);
    }

    off(event, listener) {
        this._emitter.removeListener(event, listener);
    }

    hasWorker() {
        return this._worker != null;
    }

    open() {
        if (this._worker) {
            this._postWorkerCommand({cmd: 'start'});
        } else if (this._controller) {
            this._controller.start();
        }
    }

    close() {
        if (this._worker) {
            this._postWorkerCommand({cmd: 'stop'});
        } else if (this._controller) {
            this._controller.stop();
        }
    }

    seek(milliseconds) {
        if (this._worker) {
            this._postWorkerCommand({cmd: 'seek', param: milliseconds});
        } else if (this._controller) {
            this._controller.seek(milliseconds);
        }
    }

    pause() {
        if (this._worker) {
            this._postWorkerCommand({cmd: 'pause'});
        } else if (this._controller) {
            this._controller.pause();
        }
    }

    resume() {
        if (this._worker) {
            this._postWorkerCommand({cmd: 'resume'});
        } else if (this._controller) {
            this._controller.resume();
        }
    }

    _onInitSegment(type, initSegment) {
        // do async invoke
        Promise.resolve().then(() => {
            if (this._destroyed) return;
            this._emitter.emit(TransmuxingEvents.INIT_SEGMENT, type, initSegment);
        });
    }

    _onMediaSegment(type, mediaSegment) {
        Promise.resolve().then(() => {
            if (this._destroyed) return;
            this._emitter.emit(TransmuxingEvents.MEDIA_SEGMENT, type, mediaSegment);
        });
    }

    _onAudioBuffer(type, mediaSegment) {
       
        Promise.resolve().then(() => {
            if (this._destroyed) return;

   
            this._emitter.emit(TransmuxingEvents.AUDIO_SEGMENT, type, mediaSegment.data, mediaSegment.info);
        });
    }
   

    _onLoadingComplete() {
        Promise.resolve().then(() => {
            if (this._destroyed) return;
            this._emitter.emit(TransmuxingEvents.LOADING_COMPLETE);
        });
    }

    _onRecoveredEarlyEof() {
        Promise.resolve().then(() => {
            if (this._destroyed) return;
            this._emitter.emit(TransmuxingEvents.RECOVERED_EARLY_EOF);
        });
    }

    _onMediaInfo(mediaInfo) {
        Promise.resolve().then(() => {
            if (this._destroyed) return;
            this._emitter.emit(TransmuxingEvents.MEDIA_INFO, mediaInfo);
        });
    }

    _onMetaDataArrived(metadata) {
        Promise.resolve().then(() => {
            if (this._destroyed) return;
            this._emitter.emit(TransmuxingEvents.METADATA_ARRIVED, metadata);
        });
    }

    _onScriptDataArrived(data) {
        Promise.resolve().then(() => {
            if (this._destroyed) return;
            this._emitter.emit(TransmuxingEvents.SCRIPTDATA_ARRIVED, data);
        });
    }

    _onTimedID3MetadataArrived (data) {
        Promise.resolve().then(() => {
            if (this._destroyed) return;
            this._emitter.emit(TransmuxingEvents.TIMED_ID3_METADATA_ARRIVED, data);
        })
    }

    _onSMPTE2038MetadataArrived (data) {
        Promise.resolve().then(() => {
            if (this._destroyed) return;
            this._emitter.emit(TransmuxingEvents.SMPTE2038_METADATA_ARRIVED, data);
        })
    }

    _onSCTE35MetadataArrived (data) {
        Promise.resolve().then(() => {
            if (this._destroyed) return;
            this._emitter.emit(TransmuxingEvents.SCTE35_METADATA_ARRIVED, data);
        })
    }

    _onPESPrivateDataDescriptor(data) {
        Promise.resolve().then(() => {
            if (this._destroyed) return;
            this._emitter.emit(TransmuxingEvents.PES_PRIVATE_DATA_DESCRIPTOR, data);
        });
    }

    _onPESPrivateDataArrived(data) {
        Promise.resolve().then(() => {
            if (this._destroyed) return;
            this._emitter.emit(TransmuxingEvents.PES_PRIVATE_DATA_ARRIVED, data);
        });
    }

    _onStatisticsInfo(statisticsInfo) {
        Promise.resolve().then(() => {
            if (this._destroyed) return;
            this._emitter.emit(TransmuxingEvents.STATISTICS_INFO, statisticsInfo);
        });
    }

    _onIOError(type, info) {
        Promise.resolve().then(() => {
            if (this._destroyed) return;
            this._emitter.emit(TransmuxingEvents.IO_ERROR, type, info);
        });
    }

    _onDemuxError(type, info) {
        Promise.resolve().then(() => {
            if (this._destroyed) return;
            this._emitter.emit(TransmuxingEvents.DEMUX_ERROR, type, info);
        });
    }

    _onRecommendSeekpoint(milliseconds) {
        Promise.resolve().then(() => {
            if (this._destroyed) return;
            this._emitter.emit(TransmuxingEvents.RECOMMEND_SEEKPOINT, milliseconds);
        });
    }

    _onLoggingConfigChanged(config) {
        if (this._worker) {
            this._worker.postMessage({cmd: 'logging_config', param: config});
        }
    }

    _onWorkerMessage(e) {
        //debugger
        let message = e.data;
        let data = message.data;

        if (message.msg === 'destroyed' || this._workerDestroying) {
            this._workerDestroying = false;
            this._disposeWorker();
            return;
        }
        if (this._destroyed || !this._worker) return;
        if (message.msg === 'ready') {
            clearTimeout(this._workerInitTimer);
            this._workerInitTimer = null;
            this._workerReady = true;
            const pending = this._workerPendingCommands;
            this._workerPendingCommands = [];
            for (const command of pending) this._worker.postMessage(command);
            return;
        }

        switch (message.msg) {
            case TransmuxingEvents.INIT_SEGMENT:
            case TransmuxingEvents.MEDIA_SEGMENT:
                // console.log(12121212)
                //debugger
                this._emitter.emit(message.msg, data.type, data.data);
                break;
            case TransmuxingEvents.AUDIO_SEGMENT:
                this._emitter.emit(message.msg, data.type, data.data, data.info);
                break;
            case TransmuxingEvents.LOADING_COMPLETE:
            case TransmuxingEvents.RECOVERED_EARLY_EOF:
                this._emitter.emit(message.msg);
                break;
            case TransmuxingEvents.MEDIA_INFO:
                Object.setPrototypeOf(data, MediaInfo.prototype);
                this._emitter.emit(message.msg, data);
                break;
            case TransmuxingEvents.METADATA_ARRIVED:
            case TransmuxingEvents.SCRIPTDATA_ARRIVED:
            case TransmuxingEvents.TIMED_ID3_METADATA_ARRIVED:
            case TransmuxingEvents.SMPTE2038_METADATA_ARRIVED:
            case TransmuxingEvents.SCTE35_METADATA_ARRIVED:
            case TransmuxingEvents.PES_PRIVATE_DATA_DESCRIPTOR:
            case TransmuxingEvents.PES_PRIVATE_DATA_ARRIVED:
            case TransmuxingEvents.STATISTICS_INFO:
                this._emitter.emit(message.msg, data);
                break;
            case TransmuxingEvents.IO_ERROR:
            case TransmuxingEvents.DEMUX_ERROR:
                this._emitter.emit(message.msg, data.type, data.info);
                break;
            case TransmuxingEvents.RECOMMEND_SEEKPOINT:
                this._emitter.emit(message.msg, data);
                break;
            case 'logcat_callback':
                Log.emitter.emit('log', data.type, data.logcat);
                break;
            default:
                break;
        }
    }

}

export default Transmuxer;
