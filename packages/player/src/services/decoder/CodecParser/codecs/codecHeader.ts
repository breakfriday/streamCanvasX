
import { headerStore } from '../global';
import {
  bitDepth,
  channelMode,
  sampleRate,
  bitrate,
  channels,
} from '../constants';

export default class CodecHeader {
  /**
   * @private
   */
  constructor(header) {
    headerStore.set(this, header);

    this[bitDepth] = header[bitDepth];
    this[bitrate] = null; // set during frame mapping
    this[channels] = header[channels];
    this[channelMode] = header[channelMode];
    this[sampleRate] = header[sampleRate];
  }
}
