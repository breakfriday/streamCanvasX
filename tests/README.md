# Workspace integration fixtures

## Playground 编码流调试

运行 `pnpm dev`，打开首页。默认不勾选 `webcodec`，继续使用原双 MSE 播放器。
勾选“编码流调试”后，选择本地 H.264 + AAC、H.265 或 H.264 + G.711/PCM 样本，
也可自行填写 FLV URL，再点击“创建播放器”。页面显示样本计数，浏览器控制台筛选
`[DecodeStream]` 可查看 `config`、`video`、`audio`、`pcm`、`complete` 和 `error` 日志。
此模式只检查数据输出，不执行 WebCodecs 解码或音频播放。销毁、重新创建、页面退出
和开发热更新均会清理当前会话。

`pnpm test` 会构建播放器和 playground，再运行全部测试。单独运行浏览器测试前先运行
`pnpm build && pnpm build:playground`；`tests/playground.spec.mjs` 分别验证开发页面和
构建后的页面，包括本地样本、默认双 MSE、切换模式、取消请求和网络错误。
`pnpm check` 也包含 playground 的严格 TypeScript 检查。

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
