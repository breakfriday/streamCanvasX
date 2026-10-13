import { createPlayerServiceInstance } from "@break_happy/streamcanvasx";
import {
  createStream,
  DecodeStreamEvents,
  createDecodePipeline,
  DecodePipelineEvents,
} from "@break_happy/streamcanvasx-core";
import WebCodecsVideoRenderer from "../packages/player/src/services/renderingEngines/webcodecs-video-renderer";
import type {VideoRenderBackend} from "../packages/player/src/services/renderingEngines/webcodecs-renderer-types";
import type Mpegts from "@break_happy/streamcanvasx-core";
import avURL from "../packages/playercore/tests/fixtures/av.flv?url";
import hevcURL from "../packages/playercore/tests/fixtures/hevc.flv?url";
import pcmURL from "../tests/av-pcm.flv?url";

const root = document.querySelector<HTMLElement>("#player-root");
const urlInput = document.querySelector<HTMLInputElement>("#stream-url");
const status = document.querySelector<HTMLElement>("#status");
const createButton =
  document.querySelector<HTMLButtonElement>("#create-player");
const destroyButton =
  document.querySelector<HTMLButtonElement>("#destroy-player");
const webcodecInput = document.querySelector<HTMLInputElement>("#webcodec");
const decodeVideoInput = document.querySelector<HTMLInputElement>("#decode-video");
const renderSelect = document.querySelector<HTMLSelectElement>("#render-backend");
const renderStatus = document.querySelector<HTMLElement>("#render-status");
const sampleSelect =
  document.querySelector<HTMLSelectElement>("#sample-stream");
const sampleCounts = document.querySelector<HTMLElement>("#sample-counts");

if (
  !root ||
  !urlInput ||
  !status ||
  !createButton ||
  !destroyButton ||
  !webcodecInput ||
  !decodeVideoInput ||
  !renderSelect ||
  !renderStatus ||
  !sampleSelect ||
  !sampleCounts
) {
  throw new Error("Playground DOM is incomplete.");
}

let player: ReturnType<typeof createPlayerServiceInstance> | undefined;
let decodeStream: Mpegts.DecodeStream | undefined;
let renderer: WebCodecsVideoRenderer | undefined;
let runId = 0;

function updateModeControls(): void {
  decodeVideoInput!.disabled = !webcodecInput!.checked;
  renderSelect!.disabled = !webcodecInput!.checked || !decodeVideoInput!.checked;
}
webcodecInput.addEventListener("change", updateModeControls);
decodeVideoInput.addEventListener("change", updateModeControls);
updateModeControls();

const samples: Record<string, string> = {
  av: avURL,
  hevc: hevcURL,
  pcm: pcmURL,
  live: "http://localhost:8080/live/livestream.flv",
};
sampleSelect.addEventListener("change", () => {
  urlInput.value = samples[sampleSelect.value] ?? "";
});
urlInput.addEventListener("input", () => {
  sampleSelect.value = "";
});

function destroyCurrent(): void {
  runId++;
  decodeStream?.destroy();
  decodeStream = undefined;
  renderer?.destroy();
  renderer = undefined;
  player?.destroy();
  player = undefined;
  root!.replaceChildren();
  renderStatus!.hidden = true;
}

async function startDecodeStream(url: string, session: number): Promise<void> {
  const localSample = [avURL, hevcURL, pcmURL].some(sample =>
    new URL(sample, document.baseURI).href === new URL(url, document.baseURI).href);
  const source = { type: "flv", url, isLive: !localSample };
  const config = { webcodec: true as const, enableStashBuffer: false };
  const decodeVideo = decodeVideoInput!.checked;
  const pipeline = decodeVideo
    ? createDecodePipeline(source, {...config, emitEncodedSamples: true, presentationFeedback: true})
    : undefined;
  const stream = pipeline ?? createStream(source, config);
  decodeStream = stream;
  const counts = { video: 0, audio: 0, pcm: 0, decoded: 0, rendered: 0 };
  let bufferStats: Mpegts.VideoBufferStatistics | undefined;
  const updateCounts = () => {
    const stats = renderer?.statistics;
    sampleCounts!.textContent = `视频编码帧数：${counts.video}；音频编码帧数：${counts.audio}；PCM 数据块：${counts.pcm}；接收视频帧：${counts.decoded}；渲染帧：${counts.rendered}` +
      (stats ? `；显示 FPS：${stats.renderFps}；待显示：${stats.queuedFrames} 帧 / ${Math.round(stats.bufferedAheadMs)} ms；显示丢帧：${stats.droppedFrames}；缓冲状态：${stats.state}；重新缓冲：${stats.rebufferCount}` +
        (source.isLive ? `；播放倍率：${stats.playbackRate.toFixed(3)}；接收边缘落后：${stats.liveLatencyMs === null ? '-' : Math.round(stats.liveLatencyMs)} ms；时钟前移次数：${stats.fastCatchUps}` : '') : '') +
      (bufferStats ? `；待解码：${bufferStats.encodedFrames} 帧 / ${Math.round(bufferStats.encodedBufferedMs)} ms；解码待输出：${bufferStats.pendingDecodeFrames}；解码后追帧丢弃：${bufferStats.decodeDiscardedFrames}；编码跳过：${bufferStats.encodedSkippedFrames}；解码重启：${bufferStats.keyframeJumps}${bufferStats.waitingForKeyframe ? "（等待 IDR）" : ""}；传输丢帧：${bufferStats.transportDroppedFrames}` : '');
  };
  sampleCounts!.hidden = false;
  updateCounts();

  if (pipeline) {
    status!.textContent = "正在初始化视频渲染器…";
    const videoRenderer = renderer = new WebCodecsVideoRenderer(root!, {
      backend: renderSelect!.value as VideoRenderBackend,
      live: source.isLive,
      onPresentationState: state => {
        if (session === runId) pipeline.updatePresentationState(state);
      },
      onRendered: () => {
        counts.rendered++;
        updateCounts();
      },
      onBackendChanged: (backend, reason) => {
        if (session !== runId) return;
        renderStatus!.hidden = false;
        renderStatus!.textContent = `实际渲染：${backend === 'webgl' ? 'WebGL' : 'WebGPU'}${reason ? `；WebGPU 不可用，已回退 WebGL：${reason}` : ''}`;
      },
      onError: error => {
        if (session !== runId) return;
        stream.stop();
        videoRenderer.destroy();
        status!.textContent = `视频渲染失败：${error.message}`;
        console.error("[DecodeStream][render-error]", error);
      },
    });
    await videoRenderer.ready;
    if (session !== runId) return;
    pipeline.on(DecodePipelineEvents.VIDEO_FRAME, frame => {
      counts.decoded++;
      videoRenderer.render(frame);
      updateCounts();
    });
    pipeline.on(DecodePipelineEvents.DECODE_COMPLETE, () => {
      videoRenderer.finish();
      console.log("[DecodeStream][decode-complete]", {...counts});
      status!.textContent = "视频解码完成（音频暂未播放）。";
    });
    pipeline.on(DecodePipelineEvents.VIDEO_RESET, () => videoRenderer.reset());
    pipeline.on(DecodePipelineEvents.VIDEO_LIVE_EDGE, ({pts}) => videoRenderer.updateLiveEdge(pts));
    pipeline.on(DecodePipelineEvents.VIDEO_BUFFER_STATS, stats => {
      bufferStats = stats;
      updateCounts();
    });
  }

  stream.on(DecodeStreamEvents.TRACK_CONFIG, (config) => {
    console.log("[DecodeStream][config]", config);
  });
  stream.on(DecodeStreamEvents.STATISTICS_INFO, updateCounts);
  stream.on(
    DecodeStreamEvents.ENCODED_SAMPLE,
    (sample: Mpegts.EncodedSample) => {
      if (sample.type === "video") {
        // 调试副本；真正的 VideoDecoder 在 Worker 内消费原样本。
        counts.video++;
        if (!decodeVideo) console.log("[DecodeStream][video]", sample);
      } else {
        // AAC 等音频编码样本：后续在这里接 AudioDecoder。
        counts.audio++;
        if (!decodeVideo) console.log("[DecodeStream][audio]", sample);
      }
      updateCounts();
    },
  );
  stream.on(DecodeStreamEvents.PCM_DATA, ({ data, info }) => {
    // G.711 已在内核中解码为 PCM：后续接现有 AudioContext / AudioWorklet。
    counts.pcm++;
    if (!decodeVideo) console.log("[DecodeStream][pcm]", { data, info });
    updateCounts();
  });
  stream.on(DecodeStreamEvents.ERROR, (error) => {
    console.error("[DecodeStream][error]", error);
    status!.textContent = `编码流调试失败：${error.msg}`;
  });
  stream.on(DecodeStreamEvents.LOADING_COMPLETE, () => {
    console.log("[DecodeStream][complete]", { ...counts });
    status!.textContent =
      decodeVideo ? "编码流读取完成，正在等待视频解码结束。" :
      "编码流读取完成；请在控制台筛选 [DecodeStream] 查看数据。";
  });
  status!.textContent =
    decodeVideo ? "Worker 视频解码已启动（音频暂未播放）。" :
    "编码流调试已启动；请在控制台筛选 [DecodeStream] 查看数据。";
  stream.start();
}

createButton.addEventListener("click", async () => {
  const url = urlInput.value.trim();
  if (!url) {
    status.textContent = "请先输入一个 FLV URL。";
    return;
  }

  destroyCurrent();
  sampleCounts.hidden = true;
  sampleCounts.textContent = "";
  if (webcodecInput.checked) {
    const session = runId;
    try {
      await startDecodeStream(url, session);
    } catch (error) {
      if (session !== runId) return;
      destroyCurrent();
      console.error("[DecodeStream][error]", error);
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
  status.textContent = "播放器已开始加载；请在控制台查看网络或解码错误。";
});

destroyButton.addEventListener("click", () => {
  destroyCurrent();
  status.textContent = "播放器 / 编码流已销毁。";
});

window.addEventListener("pagehide", destroyCurrent);
if (import.meta.hot) import.meta.hot.dispose(destroyCurrent);
