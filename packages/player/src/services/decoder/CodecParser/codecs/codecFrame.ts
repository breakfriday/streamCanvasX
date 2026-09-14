
import { frameStore, headerStore } from '../global';
import {
  sampleRate,
  length,
  frameNumber,
  header,
  samples,
  duration,
  totalBytesOut,
  totalSamples,
  totalDuration,
  frameLength,
  subarray,
  readRawData,
  getFrame,
  getHeader,
} from '../constants';
import Frame from '../containers/Frame';

export default class CodecFrame extends Frame {
  static* [getFrame](Header, Frame, codecParser, headerCache, readOffset) {
    const headerValue = yield* Header[getHeader](
      codecParser,
      headerCache,
      readOffset,
    );

    if (headerValue) {
      const frameLengthValue = headerStore.get(headerValue)[frameLength];
      const samplesValue = headerStore.get(headerValue)[samples];

      const frame = (yield* codecParser[readRawData](
        frameLengthValue,
        readOffset,
      ))[subarray](0, frameLengthValue);

      return new Frame(headerValue, frame, samplesValue);
    } else {
      return null;
    }
  }

  constructor(headerValue, dataValue, samplesValue) {
    super(headerValue, dataValue);

    this[header] = headerValue;
    this[samples] = samplesValue;
    this[duration] = (samplesValue / headerValue[sampleRate]) * 1000;
    this[frameNumber] = null;
    this[totalBytesOut] = null;
    this[totalSamples] = null;
    this[totalDuration] = null;

    frameStore.get(this)[length] = dataValue[length];
  }
}
