
import { codec, fixedLengthFrameSync, parseFrame } from '../../constants';

import Parser from '../parser';
import AACFrame from './AACFrame';
import AACHeader from './AACHeader';

export default class AACParser extends Parser {
  constructor(codecParser, headerCache, onCodec) {
    super(codecParser, headerCache);
    this.Frame = AACFrame;
    this.Header = AACHeader;

    onCodec(this[codec]);
  }

  get [codec]() {
    return 'aac';
  }

  * [parseFrame]() {
    return yield* this[fixedLengthFrameSync]();
  }
}
