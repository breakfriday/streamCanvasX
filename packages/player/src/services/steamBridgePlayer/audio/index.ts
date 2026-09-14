
import { injectable, inject, Container, LazyServiceIdentifer } from 'inversify';
import PlayerService from '../index';
import PCMPlayer from './audioContextPlayer';
import type { PCMBufferItem, IAduioContextPlayerConfig } from '../../../types/services';

@injectable()
class AudioPlayer {
    playerService: PlayerService
    pcmPlayer: PCMPlayer
    hasCreatPlayer: boolean
    constructor() {

    }
    init(playerService: PlayerService) {
        this.playerService=playerService;
    }

    createplayer(config: IAduioContextPlayerConfig) {
        this.pcmPlayer=new PCMPlayer();
        this.pcmPlayer.init(config,this.playerService);
        this.hasCreatPlayer=true;
    }
    feed(pcmData: Float32Array) {
        this.pcmPlayer.feedPCMDataBeta(pcmData);
    }
    destroy() {
        try{
        this.pcmPlayer.destroy();
        }catch(e) {
            let h=this.pcmPlayer;
        }
    }
    mute(parm: boolean) {
        this.pcmPlayer.mute(parm);
    }
    setGain(value: number) {
        this.pcmPlayer.setGain(value);
    }
    parseAudioData(data_buffer: ArrayBuffer) {
        let data = new DataView(data_buffer);

        const pts = data.getBigUint64(5); // 8字节
        const sampleRate = data.getUint16(13); // 2字节
        const channelCount = data.getUint8(15); // 1字节
        const bitDepth = data.getUint8(16); // 1字节
        const pcmDataLength = data.getUint32(17); // 4字节

        const headerSize = 21; // 协议头到PCM数据的总长度
        const pcmData = new Uint8Array(data_buffer, headerSize, pcmDataLength);

        let audioData = {
            pts: pts,
            sampleRate: Number(sampleRate),
            channelCount: Number(channelCount),
            bitDepth: Number(bitDepth),
            pcmData
        };
        return audioData;
    }
}


export default AudioPlayer;
