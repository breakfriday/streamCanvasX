
import { frameStore } from '../global';
import { data, header } from '../constants';

/**
 * @abstract
 */
export default class Frame {
  constructor(headerValue, dataValue) {
    frameStore.set(this, { [header]: headerValue });

    this[data] = dataValue;
  }
}
