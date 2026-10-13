import type {VideoConfig, VideoSample} from './decoder-types';

/** Conservative restart points in length-prefixed avc/hevc access units.
 * HEVC CRA/BLA recovery (including leading-picture handling) is deliberately excluded.
 */
export function isSafeVideoRestart(sample: VideoSample, config: VideoConfig): boolean {
    if (!sample.isKeyframe || sample.configId !== config.configId || sample.codec !== config.codec) return false;
    const avc = /^avc[13]\./.test(config.codec);
    const hevc = /^(hvc1|hev1)\./.test(config.codec);
    const index = avc ? 4 : hevc ? 21 : -1;
    if (index < 0 || config.description.length <= index || config.description[0] !== 1) return false;
    const lengthSize = (config.description[index] & 3) + 1;
    const data = sample.data;
    let offset = 0;
    let picture = false;
    while (offset < data.length) {
        if (offset + lengthSize > data.length) return false;
        let size = 0;
        for (let i = 0; i < lengthSize; i++) size = size * 256 + data[offset++];
        if (size < (avc ? 1 : 2) || offset + size > data.length || (data[offset] & 0x80)) return false;
        if (avc) {
            const type = data[offset] & 31;
            // Reject non-IDR VCL, including extension slices.
            if ((type >= 1 && type <= 4) || type === 19 || type === 20 || type === 21) return false;
            if (type === 5) picture = true;
        } else {
            const type = (data[offset] >> 1) & 63;
            const layer = ((data[offset] & 1) << 5) | (data[offset + 1] >> 3);
            if (layer !== 0 || (data[offset + 1] & 7) === 0) return false;
            if (type <= 31) {
                if (type !== 19 && type !== 20) return false;
                picture = true;
            }
        }
        offset += size;
    }
    return picture;
}
