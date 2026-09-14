
import { getFrame } from '../../constants';

import CodecFrame from '../codecFrame';
import AACHeader from './AACHeader';

export default class AACFrame extends CodecFrame {
  static* [getFrame](codecParser, headerCache, readOffset) {
    return yield* super[getFrame](
      AACHeader,
      AACFrame,
      codecParser,
      headerCache,
      readOffset,
    );
  }

  constructor(header, frame, samples) {
    super(header, frame, samples);
  }
}
