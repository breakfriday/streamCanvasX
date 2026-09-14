
import { frameStore } from '../global';
import {
  frame,
  length,
  incrementRawData,
  mapFrameStats,
  logWarning,
  syncFrame,
  fixedLengthFrameSync,
  getFrame,
  getHeader,
  reset,
  enable,
} from '../constants';

/**
 * @abstract
 * @description Abstract class containing methods for parsing codec frames
 */
export default class Parser {
  constructor(codecParser, headerCache) {
    this._codecParser = codecParser;
    this._headerCache = headerCache;
  }

  * [syncFrame]() {
    let frameData;

    do {
      frameData = yield* this.Frame[getFrame](
        this._codecParser,
        this._headerCache,
        0,
      );
      if (frameData) return frameData;
      this._codecParser[incrementRawData](1); // increment to continue syncing
    } while (true);
  }

  /**
   * @description Searches for Frames within bytes containing a sequence of known codec frames.
   * @param {boolean} ignoreNextFrame Set to true to return frames even if the next frame may not exist at the expected location
   * @returns {Frame}
   */
  * [fixedLengthFrameSync](ignoreNextFrame) {
    let frameData = yield* this[syncFrame]();
    const frameLength = frameStore.get(frameData)[length];

    if (
      ignoreNextFrame ||
      this._codecParser._flushing ||
      // check if there is a frame right after this one
      (yield* this.Header[getHeader](
        this._codecParser,
        this._headerCache,
        frameLength,
      ))
    ) {
      this._headerCache[enable](); // start caching when synced

      this._codecParser[incrementRawData](frameLength); // increment to the next frame
      this._codecParser[mapFrameStats](frameData);
      return frameData;
    }

    this._codecParser[logWarning](
      `Missing ${frame} at ${frameLength} bytes from current position.`,
      `Dropping current ${frame} and trying again.`,
    );
    this._headerCache[reset](); // frame is invalid and must re-sync and clear cache
    this._codecParser[incrementRawData](1); // increment to invalidate the current frame
  }
}
