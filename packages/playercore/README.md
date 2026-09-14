# Workspace 内部 playercore

本包现为 private 源码包，入口是 `src/index.js`。上层直接通过 workspace 依赖使用源码，
由仓库根目录 Vite 处理 worker 和 TypeScript，无需执行本包的 build。
在根目录运行 `pnpm dev`、`pnpm build` 和 `pnpm test:core`。

以下保留导入前的历史说明，其中独立构建/发布路径不适用于当前 workspace。

---

# streamcanvasx-core

基于 mpegts.js 的浏览器播放器内核，使用 Vite 构建，支持 FLV / MPEG-TS 转封装、MSE 播放和内联 Web Worker。

## 开发与构建

需要 Node.js `^20.19.0 || >=22.12.0`。npm 和 pnpm 均可使用；下面以 pnpm 为例。

```sh
pnpm install
pnpm dev
# 打开 http://localhost:6001/demo/index.html

pnpm build          # 类型检查、生产构建、声明生成
pnpm build:debug    # 不压缩的构建
pnpm watch          # 监听 JS 构建；类型检查另开终端运行
pnpm typecheck
```

产物：

- `dist/playercore.js`：UMD，保留浏览器全局 `mpegts` 和原来的文件名。
- `dist/playercore.mjs`：ESM，供支持 `package.json#module` 的构建器使用。
- `dist/types/`：生成的内部声明。npm 公共类型入口仍为 `d.ts/mpegts.d.ts`。
- JS source map：用于调试主线程与 Worker。

```js
import mpegts from 'streamcanvasx-core';

const player = mpegts.createPlayer(
    { type: 'flv', url: '/live.flv', isLive: true },
    { enableWorker: true }
);
player.attachMediaElement(document.querySelector('video'));
player.load();
player.play();
```

直接引入脚本的页面继续使用：

```html
<script src="./dist/playercore.js"></script>
```

## 浏览器验证

```sh
pnpm exec playwright install chromium
pnpm build
pnpm test
```

也可通过 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 指定已有 Chrome / Chromium 的可执行文件。测试启动本地 6001 端口，覆盖源码、ESM、UMD 的 FLV / MPEG-TS 播放、Worker 开关、PCM 事件、销毁重建和 Worker 启动失败回退。样本在 `tests/fixtures/`，不依赖外部直播服务。

## 兼容性

构建目标为 ES2018；浏览器还需要支持所用媒体编码、MSE 等运行时 API。旧版文档中的 IE11 / ES5 兼容性不再适用于此构建。

生产包将 Worker 内联，使用方不需要额外部署 Worker 脚本；若网站启用了 CSP，需要允许 Blob Worker（例如 `worker-src 'self' blob:`）。Worker 启动失败或 10 秒内未完成初始化时回退到主线程；播放期间的 Worker 错误通过原有错误事件上报。

PCM 继续通过 `audio_segment` 事件输出 ArrayBuffer，交给调用方播放。本次迁移未引入 AudioWorklet 或 WASM。

详细说明见 [Vite 迁移说明](docs/vite-migration.md)，原有播放功能文档见 [README_zh.md](README_zh.md)。
