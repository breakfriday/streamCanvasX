
import { injectable, inject, Container, LazyServiceIdentifer } from 'inversify';


class AacPlayer {
    constructor() {

    }

    canPlayType(mimeType: string) {
        const mapping = {
          mpeg: ['audio/mp4;codecs="mp3"'],
          aac: ['audio/mp4;codecs="mp4a.40.2"'],
          aacp: ['audio/mp4;codecs="mp4a.40.2"'],
          flac: ['audio/mp4;codecs="flac"'],
          ogg: {
            flac: ['audio/mp4;codecs="flac"'],
            opus: ['audio/mp4;codecs="opus"', 'audio/webm;codecs="opus"'],
            vorbis: ['audio/webm;codecs="vorbis"'],
          },
        };


        const isTypeSupported = MediaSource.isTypeSupported('audio/aac');
        return isTypeSupported;
      }
}