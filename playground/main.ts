import { createPlayerServiceInstance } from '@break_happy/streamcanvasx';
import { createStream, DecodeStreamEvents } from '@break_happy/streamcanvasx-core';
import type Mpegts from '@break_happy/streamcanvasx-core';
import avURL from '../packages/playercore/tests/fixtures/av.flv?url';
import hevcURL from '../packages/playercore/tests/fixtures/hevc.flv?url';
import pcmURL from '../tests/av-pcm.flv?url';

const root = document.querySelector<HTMLElement>('#player-root');
const urlInput = document.querySelector<HTMLInputElement>('#stream-url');
const status = document.querySelector<HTMLElement>('#status');
const createButton = document.querySelector<HTMLButtonElement>('#create-player');
const destroyButton = document.querySelector<HTMLButtonElement>('#destroy-player');
const webcodecInput = document.querySelector<HTMLInputElement>('#webcodec');
const sampleSelect = document.querySelector<HTMLSelectElement>('#sample-stream');
const sampleCounts = document.querySelector<HTMLElement>('#sample-counts');

if (!root || !urlInput || !status || !createButton || !destroyButton || !webcodecInput || !sampleSelect || !sampleCounts) {
  throw new Error('Playground DOM is incomplete.');
}

let player: ReturnType<typeof createPlayerServiceInstance> | undefined;
let decodeStream: Mpegts.DecodeStream | undefined;

const samples: Record<string, string> = { av: avURL, hevc: hevcURL, pcm: pcmURL };
sampleSelect.addEventListener('change', () => {
  urlInput.value = samples[sampleSelect.value] ?? '';
});
urlInput.addEventListener('input', () => { sampleSelect.value = ''; });

function destroyCurrent(): void {
  decodeStream?.destroy();
  decodeStream = undefined;
  player?.destroy();
  player = undefined;
  root!.replaceChildren();
}

function startDecodeStream(url: string): void {
  const stream = createStream(
    { type: 'flv', url, isLive: true },
    { webcodec: true, enableWorker: false, enableStashBuffer: false },
  );
  decodeStream = stream;
  const counts = { video: 0, audio: 0, pcm: 0 };
  const updateCounts = () => {
    sampleCounts!.textContent = `视频样本：${counts.video}；音频样本：${counts.audio}；PCM 数据块：${counts.pcm}`;
  };
  sampleCounts!.hidden = false;
  updateCounts();

  stream.on(DecodeStreamEvents.TRACK_CONFIG, config => {
    console.log('[DecodeStream][config]', config);
  });
  stream.on(DecodeStreamEvents.ENCODED_SAMPLE, (sample: Mpegts.EncodedSample) => {
    if (sample.type === 'video') {
      // H.264 / H.265 编码样本：后续在这里接 VideoDecoder。
      counts.video++;
      console.log('[DecodeStream][video]', sample);
    } else {
      // AAC 等音频编码样本：后续在这里接 AudioDecoder。
      counts.audio++;
      console.log('[DecodeStream][audio]', sample);
    }
    updateCounts();
  });
  stream.on(DecodeStreamEvents.PCM_DATA, ({ data, info }) => {
    // G.711 已在内核中解码为 PCM：后续接现有 AudioContext / AudioWorklet。
    counts.pcm++;
    console.log('[DecodeStream][pcm]', { data, info });
    updateCounts();
  });
  stream.on(DecodeStreamEvents.ERROR, error => {
    console.error('[DecodeStream][error]', error);
    status!.textContent = `编码流调试失败：${error.msg}`;
  });
  stream.on(DecodeStreamEvents.LOADING_COMPLETE, () => {
    console.log('[DecodeStream][complete]', { ...counts });
    status!.textContent = '编码流读取完成；请在控制台筛选 [DecodeStream] 查看数据。';
  });
  status!.textContent = '编码流调试已启动；请在控制台筛选 [DecodeStream] 查看数据。';
  stream.start();
}

createButton.addEventListener('click', () => {
  const url = urlInput.value.trim();
  if (!url) {
    status.textContent = '请先输入一个 FLV URL。';
    return;
  }

  destroyCurrent();
  sampleCounts.hidden = true;
  sampleCounts.textContent = '';
  if (webcodecInput.checked) {
    try {
      startDecodeStream(url);
    } catch (error) {
      destroyCurrent();
      console.error('[DecodeStream][error]', error);
      status.textContent = `编码流调试失败：${error instanceof Error ? error.message : String(error)}`;
    }
    return;
  }

  player = createPlayerServiceInstance({
    url,
    contentEl: root,
    hasAudio: true,
    hasVideo: true,
  });
  player.createPlayer({});
  status.textContent = '播放器已开始加载；请在控制台查看网络或解码错误。';
});

destroyButton.addEventListener('click', () => {
  destroyCurrent();
  status.textContent = '播放器 / 编码流已销毁。';
});

window.addEventListener('pagehide', destroyCurrent);
if (import.meta.hot) import.meta.hot.dispose(destroyCurrent);
