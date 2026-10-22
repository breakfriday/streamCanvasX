# Workspace integration fixtures

## Playground 编码流调试

运行 `pnpm dev`，打开首页。默认不勾选 `webcodec`，继续使用原双 MSE 播放器。
勾选“WebCodecs 独立链路”后，选择本地 H.264 + AAC、H.265 或 H.264 + G.711/PCM 样本，
也可自行填写 FLV URL，再点击“创建播放器”。页面显示样本计数，浏览器控制台筛选
`[DecodeStream]` 可查看 `config`、`video`、`audio`、`pcm`、`complete` 和 `error` 日志。
WebCodecs 模式默认勾选“解码并显示视频”，默认 WebGL 渲染。
取消该选项才进入纯编码样本调试模式；播放视频时只更新计数，不逐包打印日志。
可选择 WebGPU，缺少 API/适配器、设备初始化失败、超时或设备丢失时回退到独立的 WebGL Canvas。
页面显示实际后端和回退原因。两种新模式都固定使用 Worker，不播放音频。
视频使用独立 PTS 时钟和有上限的显示队列，本地样本起播缓冲为 100ms，不做音视频对齐。
直播改用 60ms 短起播缓冲，并按接收边缘平滑快放（默认最高 1.25 倍）；超过 500ms 时快速追到约 100ms 余量。
这六项显示策略在 `packages/player/src/constant/webcodecs-config.ts` 内部统一维护，不接受外部覆盖；显示队列上限为 400ms / 16 帧。
本地样本保持完整播放，不套用直播边缘跳帧策略。页面显示倍率、接收边缘落后和各阶段丢弃数量。
页面显示最近一秒的显示 FPS、待显示帧数/时长和显示队列丢帧数。
呈现反馈已接回 Worker，额外显示编码队列水位、解码待输出、传输丢帧、缓冲状态和重新缓冲次数。
销毁、重新创建、页面退出和开发热更新均会清理当前会话。
“本机直播”选项填入 `http://localhost:8080/live/livestream.flv`，需要该服务已启动。

`pnpm test` 会构建播放器和 playground，再运行全部测试。单独运行浏览器测试前先运行
`pnpm build && pnpm build:playground`；`tests/playground.spec.mjs` 分别验证开发页面和
构建后的页面，包括本地样本、默认双 MSE、切换模式、取消请求和网络错误。
`pnpm check` 也包含 playground 的严格 TypeScript 检查。

`packages/playercore/tests/webcodecs-worker.spec.mjs` 检查真实 Worker 视频解码、像素输出、
会话隔离、帧释放和错误。可额外设置 `STREAMCANVASX_LIVE_URL` 运行实际直播持续解码与
重启验证；未设置时只跳过这项外部服务测试。H.265 样本输出不要求设备支持 HEVC 解码，
实际解码不支持时应显示错误，不回退到 MSE。

`tests/webcodecs-renderer.spec.mjs` 验证 WebGL 像素/方向、WebGPU 回退、初始化取消、帧释放。
`STREAMCANVASX_TEST_WEBGPU=1` 启用真实 WebGPU 像素和设备丢失测试，需要可用的 WebGPU 适配器。
本机 Linux 无头测试使用独立浏览器的 Vulkan/SwiftShader 参数，不修改默认构建或用户浏览器。
`tests/video-frame-queue.spec.mjs` 用模拟时钟验证成批到达的 30 fps 帧仍按 PTS 展示、积压追帧和时间戳重置。
同时覆盖持续轻微迟到后的重新缓冲、不同刷新率、重复帧释放和短尾部排空。
`tests/video-decode-scheduler.spec.mjs` 验证解码顺序、配置屏障、编码容量限制、呈现反压、
codec 前视、取消清理和 EOF。Worker 测试还使用真实 45 帧 H.264 样本验证暂停呈现反馈后解码停止推进，
恢复后无丢帧地完成排空。非直播输入严重超限仍报错；直播覆盖安全跳 GOP 和无 IDR 时等待恢复。
直播专项覆盖：400ms 中等积压的平滑收敛、60/120/144Hz 下的倍率一致性、严重积压后的快速前移、
断流恢复不被丢弃截止时间锁死，以及显示端满载时仍完整解码参考帧、只丢弃过期输出。
真实 Worker 还验证整批 FLV 直播历史到达时能靠近接收边缘，而非按 1 倍速回放整段历史。

`av-pcm.flv` contains the synthetic video from core's `av.flv` and its 440 Hz sine wave
converted to G.711 mu-law at 8 kHz. It exercises video MSE and upper-layer PCM output together.
Tests use the committed file and do not require FFmpeg. Regenerate from the workspace root:

```sh
ffmpeg -i packages/playercore/tests/fixtures/av.flv -c:v copy -ar 8000 -c:a pcm_mulaw -f flv tests/av-pcm.flv
```

The PCM integration test prepares AudioWorklet before loading the short local fixture and
sends core events through the upper player's `handleAudioSegment`. It avoids playing the
empty audio MediaSource in the legacy split-MSE path. `audio-worklet.spec.mjs` separately
checks that packets arriving before initialization are dropped without being replayed,
then verifies output channels and tone frequencies at 8/16 kHz, format changes and destruction
during initialization.

直播编码恢复专项：NALU 级 IDR 判定（含假关键帧、CRA、错误长度、混合 VCL、不同前缀长度）、
配置屏障和 PTS 重排保持、配置/解码提交阻塞时取消旧任务、迟到帧关闭、无 IDR 时内存有界、
等待期间配置切换和 EOF/destroy。真实 Worker 使用由现有 H.264 fixture 构造的多 IDR 积压，
验证跳过编码数据、传输代次重置、最终时间戳与蓝色像素；source/bundle 均运行。
