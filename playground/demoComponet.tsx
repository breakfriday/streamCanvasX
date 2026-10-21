import { useEffect, useRef, useState } from "react";
import styles from "./index.module.css";
import { createPlayerServiceInstance } from "@break_happy/streamcanvasx";
import {
  createStream,
  DecodeStreamEvents,
  createDecodePipeline,
  DecodePipelineEvents,
} from "@break_happy/streamcanvasx-core";
import WebCodecsVideoRenderer from "../packages/player/src/services/renderingEngines/webcodecs-video-renderer";
import type { VideoRenderBackend } from "../packages/player/src/services/renderingEngines/webcodecs-renderer-types";
import type Mpegts from "@break_happy/streamcanvasx-core";
import avURL from "../packages/playercore/tests/fixtures/av.flv?url";
import hevcURL from "../packages/playercore/tests/fixtures/hevc.flv?url";
import pcmURL from "../tests/av-pcm.flv?url";

export default function DemoComponent() {
  const playerRootRef = useRef<HTMLDivElement>(null);
  const comparisonRootRef = useRef<HTMLDivElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const sampleRef = useRef<HTMLSelectElement>(null);
  const webcodecRef = useRef<HTMLInputElement>(null);
  const decodeVideoRef = useRef<HTMLInputElement>(null);
  const renderRef = useRef<HTMLSelectElement>(null);
  const latencyRef = useRef<HTMLInputElement>(null);
  const actions = useRef<
    Partial<
      Record<
        "create" | "compare" | "destroy" | "selectSample" | "inputUrl",
        () => void
      >
    >
  >({});
  const [sessionMode, setSessionMode] = useState("待机");
  const [webcodec, setWebcodec] = useState(false);
  const [decodeVideo, setDecodeVideo] = useState(true);
  const [status, setStatus] = useState("");
  const [sampleCounts, setSampleCounts] = useState("");
  const [mseCounts, setMseCounts] = useState("");
  const [renderStatus, setRenderStatus] = useState("");
  const [comparing, setComparing] = useState(false);
  const [showSamples, setShowSamples] = useState(false);
  const [showRenderStatus, setShowRenderStatus] = useState(false);

  useEffect(() => {
    const root = playerRootRef.current!;
    const comparisonRoot = comparisonRootRef.current!;
    const urlInput = urlRef.current!;
    const sampleSelect = sampleRef.current!;
    const webcodecInput = webcodecRef.current!;
    const decodeVideoInput = decodeVideoRef.current!;
    const renderSelect = renderRef.current!;
    let player: ReturnType<typeof createPlayerServiceInstance> | undefined;
    let decodeStream: Mpegts.DecodeStream | undefined;
    let renderer: WebCodecsVideoRenderer | undefined;
    let runId = 0;
    const cleanups: Array<() => void> = [];

    function numberSetting(id: string, fallback: number): number {
      const input = latencyRef.current!;
      const value =
        input.value === "" && !input.validity.badInput
          ? fallback
          : input.valueAsNumber;
      if (!Number.isFinite(value)) throw new Error(`${id} 必须是有效数字`);
      return value;
    }

    function readMseLatency(): number {
      const latency = numberSetting("mse-max-latency", 1.5);
      if (latency <= 0.5)
        throw new Error("MSE 追帧触发阈值必须大于保留缓冲 0.5 秒");
      return latency;
    }

    function configureMse(maxLatency: number): void {
      // Use the existing upper-player configuration entry; preserve other settings.
      const host = window as Window & {
        playerCustomConfig?: Record<string, unknown>;
      };
      host.playerCustomConfig = {
        ...host.playerCustomConfig,
        liveBufferLatencyMaxLatency: maxLatency,
      };
    }

    function watchStatistics(update: () => void): void {
      let animation = 0;
      const tick = () => {
        update();
        animation = requestAnimationFrame(tick);
      };
      animation = requestAnimationFrame(tick);
      cleanups.push(() => cancelAnimationFrame(animation));
    }

    function isLocalSample(url: string): boolean {
      return [avURL, hevcURL, pcmURL].some(
        (sample) =>
          new URL(sample, document.baseURI).href ===
          new URL(url, document.baseURI).href,
      );
    }

    function startMseComparison(url: string, maxLatency: number): void {
      configureMse(maxLatency);
      const current = (player = createPlayerServiceInstance({
        url,
        contentEl: comparisonRoot,
        streamType: "flv",
        isLive: !isLocalSample(url),
        hasAudio: true,
        hasVideo: true,
        isMuted: true,
      }));
      current.createPlayer({});
      const started = performance.now();
      let firstFrameMs: number | undefined;
      let frameTimes: number[] = [];
      const video = current.meidiaEl;
      if (!(video instanceof HTMLVideoElement))
        throw new Error("MSE 视频元素未创建");
      let callback = 0;
      const onFrame = () => {
        const now = performance.now();
        firstFrameMs ??= now - started;
        frameTimes = frameTimes.filter((time) => now - time < 1000);
        frameTimes.push(now);
        callback = video.requestVideoFrameCallback(onFrame);
      };
      callback = video.requestVideoFrameCallback(onFrame);
      watchStatistics(() => {
        const now = performance.now();
        frameTimes = frameTimes.filter((time) => now - time < 1000);
        const ranges = video.buffered;
        const end = ranges.length ? ranges.end(ranges.length - 1) : null;
        const quality = video.getVideoPlaybackQuality();
        setMseCounts(
          `视频呈现 FPS：${frameTimes.length}；首帧等待：${firstFrameMs === undefined ? "等待中" : Math.round(firstFrameMs) + " ms"}；缓冲末尾距播放位置：${end === null ? "-" : Math.round(Math.max(0, end - video.currentTime) * 1000)} ms；浏览器丢帧：${quality.droppedVideoFrames}；readyState：${video.readyState}；播放倍率：${video.playbackRate.toFixed(3)}`,
        );
      });
      cleanups.push(() => video.cancelVideoFrameCallback(callback));
    }

    const samples: Record<string, string> = {
      av: avURL,
      hevc: hevcURL,
      pcm: pcmURL,
      live: "http://localhost:8080/live/livestream.flv",
    };
    actions.current.selectSample = () => {
      urlInput.value = samples[sampleSelect.value] ?? "";
    };
    actions.current.inputUrl = () => {
      sampleSelect.value = "";
    };

    function destroyCurrent(): void {
      runId++;
      setSessionMode("待机");
      for (const cleanup of cleanups.splice(0)) cleanup();
      decodeStream?.destroy();
      decodeStream = undefined;
      renderer?.destroy();
      renderer = undefined;
      player?.destroy();
      player = undefined;
      root!.replaceChildren();
      comparisonRoot.replaceChildren();
      setComparing(false);
      setMseCounts("");
      setShowRenderStatus(false);
    }

    async function startDecodeStream(
      url: string,
      session: number,
      mseLatency?: number,
    ): Promise<void> {
      const comparison = mseLatency !== undefined;
      const localSample = isLocalSample(url);
      const source = { type: "flv", url, isLive: !localSample };
      const config = { webcodec: true as const, enableStashBuffer: false };
      const decodeVideo = comparison || decodeVideoInput!.checked;
      const pipeline = decodeVideo
        ? createDecodePipeline(source, {
            ...config,
            emitEncodedSamples: !comparison,
            presentationFeedback: true,
          })
        : undefined;
      const stream = pipeline ?? createStream(source, config);
      decodeStream = stream;
      const counts = { video: 0, audio: 0, pcm: 0, decoded: 0, rendered: 0 };
      let bufferStats: Mpegts.VideoBufferStatistics | undefined;
      let playbackStartedAt = 0;
      let firstFrameMs: number | undefined;
      const updateCounts = () => {
        if (session !== runId) return;
        const stats = renderer?.statistics;
        setSampleCounts(
          (comparison
            ? `首帧等待：${firstFrameMs === undefined ? "等待中" : Math.round(firstFrameMs) + " ms"}；`
            : `视频编码帧数：${counts.video}；音频编码帧数：${counts.audio}；PCM 数据块：${counts.pcm}；`) +
            `接收视频帧：${counts.decoded}；渲染帧：${counts.rendered}` +
            (stats
              ? `；显示 FPS：${stats.renderFps}；待显示：${stats.queuedFrames} 帧 / ${Math.round(stats.bufferedAheadMs)} ms；显示丢帧：${stats.droppedFrames}；缓冲状态：${stats.state}；重新缓冲：${stats.rebufferCount}` +
                (source.isLive
                  ? `；播放倍率：${stats.playbackRate.toFixed(3)}；接收边缘落后：${stats.liveLatencyMs === null ? "-" : Math.round(stats.liveLatencyMs)} ms；时钟前移次数：${stats.fastCatchUps}`
                  : "")
              : "") +
            (bufferStats
              ? `；待解码：${bufferStats.encodedFrames} 帧 / ${Math.round(bufferStats.encodedBufferedMs)} ms；解码待输出：${bufferStats.pendingDecodeFrames}；解码后追帧丢弃：${bufferStats.decodeDiscardedFrames}；编码跳过：${bufferStats.encodedSkippedFrames}；解码重启：${bufferStats.keyframeJumps}${bufferStats.waitingForKeyframe ? "（等待 IDR）" : ""}；传输丢帧：${bufferStats.transportDroppedFrames}`
              : ""),
        );
      };
      setShowSamples(true);
      updateCounts();
      watchStatistics(updateCounts);

      if (pipeline) {
        setStatus("正在初始化视频渲染器…");
        const videoRenderer = (renderer = new WebCodecsVideoRenderer(root!, {
          backend: renderSelect!.value as VideoRenderBackend,
          live: source.isLive,
          onPresentationState: (state) => {
            if (session === runId) pipeline.updatePresentationState(state);
          },
          onRendered: () => {
            firstFrameMs ??= performance.now() - playbackStartedAt;
            counts.rendered++;
            updateCounts();
          },
          onBackendChanged: (backend, reason) => {
            if (session !== runId) return;
            setShowRenderStatus(true);
            setRenderStatus(
              `实际渲染：${backend === "webgl" ? "WebGL" : "WebGPU"}${reason ? `；WebGPU 不可用，已回退 WebGL：${reason}` : ""}`,
            );
          },
          onError: (error) => {
            if (session !== runId) return;
            stream.stop();
            videoRenderer.destroy();
            setStatus(`视频渲染失败：${error.message}`);
            console.error("[DecodeStream][render-error]", error);
          },
        }));
        await videoRenderer.ready;
        if (session !== runId) return;
        pipeline.on(DecodePipelineEvents.VIDEO_FRAME, (frame) => {
          counts.decoded++;
          videoRenderer.render(frame);
          updateCounts();
        });
        pipeline.on(DecodePipelineEvents.DECODE_COMPLETE, () => {
          videoRenderer.finish();
          console.log("[DecodeStream][decode-complete]", { ...counts });
          setStatus("视频解码完成（音频暂未播放）。");
        });
        pipeline.on(DecodePipelineEvents.VIDEO_RESET, () =>
          videoRenderer.reset(),
        );
        pipeline.on(DecodePipelineEvents.VIDEO_LIVE_EDGE, ({ pts }) =>
          videoRenderer.updateLiveEdge(pts),
        );
        pipeline.on(DecodePipelineEvents.VIDEO_BUFFER_STATS, (stats) => {
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
        setStatus(`编码流调试失败：${error.msg}`);
      });
      stream.on(DecodeStreamEvents.LOADING_COMPLETE, () => {
        console.log("[DecodeStream][complete]", { ...counts });
        setStatus(
          decodeVideo
            ? "编码流读取完成，正在等待视频解码结束。"
            : "编码流读取完成；请在控制台筛选 [DecodeStream] 查看数据。",
        );
      });
      setStatus(
        decodeVideo
          ? "Worker 视频解码已启动（音频暂未播放）。"
          : "编码流调试已启动；请在控制台筛选 [DecodeStream] 查看数据。",
      );
      playbackStartedAt = performance.now();
      stream.start();
      if (mseLatency !== undefined) startMseComparison(url, mseLatency);
    }

    actions.current.create = async () => {
      const url = urlInput.value.trim();
      if (!url) {
        setStatus("请先输入一个 FLV URL。");
        return;
      }

      let mseLatency: number;
      try {
        mseLatency = webcodecInput.checked ? 1.5 : readMseLatency();
      } catch (error) {
        setStatus(`配置无效：${(error as Error).message}`);
        return;
      }
      destroyCurrent();
      setShowSamples(false);
      setSampleCounts("");
      if (webcodecInput.checked) {
        setSessionMode(decodeVideoInput.checked ? "WebCodecs" : "样本调试");
        const session = runId;
        try {
          await startDecodeStream(url, session);
        } catch (error) {
          if (session !== runId) return;
          destroyCurrent();
          console.error("[DecodeStream][error]", error);
          setStatus(
            `编码流调试失败：${error instanceof Error ? error.message : String(error)}`,
          );
        }
        return;
      }

      setSessionMode("MSE");
      configureMse(mseLatency);
      player = createPlayerServiceInstance({
        url,
        contentEl: root,
        hasAudio: true,
        hasVideo: true,
      });
      player.createPlayer({});
      setStatus("播放器已开始加载；请在控制台查看网络或解码错误。");
    };

    actions.current.compare = async () => {
      const url = urlInput.value.trim();
      if (!url) {
        setStatus("请先输入一个 FLV URL。");
        return;
      }
      let mseLatency: number;
      try {
        mseLatency = readMseLatency();
      } catch (error) {
        setStatus(`配置无效：${(error as Error).message}`);
        return;
      }
      destroyCurrent();
      setComparing(true);
      setSessionMode("双路对比");
      setShowSamples(true);
      setMseCounts("等待 MSE 启动…");
      const session = runId;
      try {
        await startDecodeStream(url, session, mseLatency);
      } catch (error) {
        if (session !== runId) return;
        destroyCurrent();
        setStatus(
          `双路对比启动失败：${error instanceof Error ? error.message : String(error)}`,
        );
      }
    };

    actions.current.destroy = () => {
      destroyCurrent();
      setStatus("播放器 / 编码流已销毁。");
    };

    window.addEventListener("pagehide", destroyCurrent);
    return () => {
      window.removeEventListener("pagehide", destroyCurrent);
      destroyCurrent();
      actions.current = {};
    };
  }, []);

  const metric = (name: string) =>
    sampleCounts
      .split("；")
      .find((item) => item.startsWith(`${name}：`))
      ?.slice(name.length + 1) || "—";
  const failed = /失败|无效/.test(status);

  return (
    <div className={styles.workspace}>
      <aside className={styles.sidebar} aria-label="测试配置">
        <div className={styles.controlGroup}>
          <h2>输入源</h2>
          <label className={styles.field}>
            FLV URL
            <input
              id="stream-url"
              ref={urlRef}
              onInput={() => actions.current.inputUrl?.()}
              placeholder="https://example.com/live.flv"
              spellCheck={false}
            />
          </label>
          <label className={styles.field}>
            本地样本
            <select
              id="sample-stream"
              ref={sampleRef}
              onChange={() => actions.current.selectSample?.()}
            >
              <option value="">自定义地址</option>
              <option value="av">H.264 + AAC</option>
              <option value="hevc">H.265（仅视频）</option>
              <option value="pcm">H.264 + G.711 / PCM</option>
              <option value="live">本机直播（localhost:8080）</option>
            </select>
          </label>
        </div>
        <div className={styles.controlGroup}>
          <h2>解码与渲染</h2>
          <label className={styles.checkField}>
            <input
              id="webcodec"
              ref={webcodecRef}
              onChange={(event) => setWebcodec(event.target.checked)}
              type="checkbox"
              checked={webcodec}
            />
            <span>
              WebCodecs 独立链路<small> 默认 false 走mse 链路</small>
            </span>
          </label>
          <label className={styles.checkField}>
            <input
              id="decode-video"
              ref={decodeVideoRef}
              onChange={(event) => setDecodeVideo(event.target.checked)}
              type="checkbox"
              checked={decodeVideo}
              disabled={!webcodec}
            />
            <span>
              {/* 解码并显示视频<small>取消后仅调试编码与 PCM 样本</small> */}
            </span>
          </label>
          <label className={styles.field}>
            视频渲染后端
            <select
              id="render-backend"
              ref={renderRef}
              disabled={!webcodec || !decodeVideo}
            >
              <option value="webgl">WebGL（默认）</option>
              <option value="webgpu">WebGPU（不可用时回退 WebGL）</option>
            </select>
          </label>
          <p className={styles.hint}>
            默认使用原 MSE 播放器。修改配置后，点击创建播放器生效。
          </p>
        </div>
        <fieldset className={styles.controlGroup}>
          <legend>MSE 直播延迟</legend>
          <label className={styles.field}>
            追帧触发阈值 / 秒
            <input
              id="mse-max-latency"
              ref={latencyRef}
              type="number"
              min="0.51"
              step="any"
              defaultValue="1.5"
            />
          </label>
          <p className={styles.hint}>
            追帧后保留 0.5 秒缓冲，阈值必须大于 0.5
            秒。越接近，越容易频繁跳转；重新创建后生效。
          </p>
        </fieldset>
      </aside>

      <div className={styles.mainPanel}>
        <section className={styles.toolbar} aria-label="测试操作">
          <div></div>
          <div className={styles.actions}>
            <button
              id="create-player"
              className={styles.primaryButton}
              onClick={() => actions.current.create?.()}
              type="button"
            >
              <span aria-hidden="true">▶</span> 创建播放器
            </button>
            <button
              id="compare-players"
              onClick={() => actions.current.compare?.()}
              type="button"
            >
              双路对比 MSE / WebCodecs
            </button>
            <button
              id="destroy-player"
              className={styles.dangerButton}
              onClick={() => actions.current.destroy?.()}
              type="button"
            >
              销毁播放器
            </button>
          </div>
        </section>
        <div className={styles.statusBar} data-error={failed || undefined}>
          <span className={styles.sessionBadge}>{sessionMode}</span>
          <p id="status" role="status">
            {status || "准备就绪，等待启动测试。"}
          </p>
        </div>

        <section className={styles.overview} aria-label="WebCodecs 关键指标">
          {[
            ["显示帧率", metric("显示 FPS"), "FPS"],
            ["接收边缘落后", metric("接收边缘落后"), "非端到端延迟"],
            ["显示丢帧", metric("显示丢帧"), "累计帧数"],
            ["缓冲状态", metric("缓冲状态"), "WebCodecs"],
          ].map(([label, value, unit]) => (
            <div className={styles.metricCard} key={label}>
              <span>{label}</span>
              <strong>{showSamples ? value : "—"}</strong>
              <small>{unit}</small>
            </div>
          ))}
        </section>

        <div
          className={`${styles.previews} ${comparing ? styles.comparing : ""}`}
        >
          <section
            id="comparison-panel"
            hidden={!comparing}
            className={styles.previewPanel}
          >
            <header className={styles.previewHeader}>
              <h2>
                MSE <span>音视频独立</span>
              </h2>
              <span className={styles.tag}>A / MUTED</span>
            </header>
            <div
              id="comparison-root"
              ref={comparisonRootRef}
              className={styles.playerRoot}
            />
            <div className={styles.previewFooter}>独立拉流 · 音频静音</div>
            <div id="mse-counts" className={styles.statistics}>
              {mseCounts
                .split("；")
                .filter(Boolean)
                .map((item, index) => (
                  <div key={index}>{item}</div>
                ))}
            </div>
          </section>
          <section className={styles.previewPanel}>
            <header className={styles.previewHeader}>
              <h2 id="preview-title" hidden={!comparing}>
                WebCodecs <span>Worker 解码</span>
              </h2>
              {!comparing && (
                <h2>
                  视频监看{" "}
                  <span>
                    {sessionMode === "待机" ? "等待输入" : sessionMode}
                  </span>
                </h2>
              )}
            </header>
            <div
              id="player-root"
              ref={playerRootRef}
              className={styles.playerRoot}
            />
            <div className={styles.previewFooter}>
              <span id="render-status" hidden={!showRenderStatus}>
                {renderStatus}
              </span>
            </div>
          </section>
        </div>
        <p id="comparison-note" hidden={!comparing} className={styles.notice}>
          同一 URL，独立拉流，同时启动；MSE 静音，WebCodecs
          暂不播放音频。缓冲余量和接收边缘落后不是端到端延迟，两路 currentTime /
          PTS
          也不能直接相减。请对照画面内时间码或相同动作判断相对延迟；并排播放会增加机器负载。
        </p>

        <section className={styles.telemetry}>
          <header className={styles.panelHeading}>
            <div>
              <h2>解码与渲染指标</h2>
            </div>
            <span className={styles.tag}>WEBCODECS</span>
          </header>
          {!showSamples && <p className={styles.emptyMetrics}>decode stream</p>}
          <div
            id="sample-counts"
            hidden={!showSamples}
            className={styles.statistics}
          >
            {sampleCounts
              .split("；")
              .filter(Boolean)
              .map((item, index) => (
                <div key={index}>{item}</div>
              ))}
          </div>
        </section>
      </div>
    </div>
  );
}
