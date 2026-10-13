import {test, expect} from '@playwright/test';

test('video timestamps remain finite when audio samples arrive in an earlier network batch', async ({page}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const {default: Remuxer} = await import('/packages/playercore/src/remux/mp4-remuxer.js');
    const remuxer = new Remuxer({isLive: true});
    const segments = [];
    remuxer.onMediaSegment = (type, segment) => segments.push(segment.info);
    remuxer._videoMeta = {refSampleDuration: 40};
    const video = {type: 'video', id: 1, sequenceNumber: 0, samples: [], length: 0};
    // No video samples in the first network batch, even though metadata is available.
    remuxer.remux({samples: [{dts: 10000}]}, video);
    for (const dts of [10100, 10140, 10180]) {
      const data = new Uint8Array([0,0,0,1,0x65]);
      video.samples.push({dts, cts: 0, isKeyframe: true, length: data.length, units: [{data}]});
      video.length += data.length;
    }
    remuxer.remux(null, video);
    const info = segments[0];
    const result = {base: remuxer._videoDtsBase, begin: info.beginDts, end: info.endDts,
      valid: Number.isFinite(info.beginDts) && Number.isFinite(info.endDts)};
    remuxer.destroy(); return result;
  });
  expect(result).toEqual({base: 10100, begin: 0, end: 80, valid: true});
});
