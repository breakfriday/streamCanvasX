# Vite 构建迁移

## 构建与发布

- 移除 webpack、ts-loader、webworkify-webpack 及旧构建工具链，使用 Vite 8 库模式。
- 保留 `dist/playercore.js`、UMD 全局 `mpegts`、默认导出的公共 API 和手写声明入口；增加 `dist/playercore.mjs`。
- 使用 Vite `define` 注入 package.json 版本，`mpegts.version` 与 `window.playCoreVersion` 保持一致。
- 将 CommonJS 源码入口和 Promise polyfill 改为 ESM；显式依赖并打包浏览器版 `events`，主线程和 Worker 使用同一解析配置。
- 移除未使用的 `cluster` 和直接引用 node_modules 的 codec-parser 导入。
- TypeScript 固定在 5.9 系列；Vite 负责转换，`tsc` 负责源码及公共 API 类型检查，并单独生成内部声明，避免覆盖 `d.ts/mpegts.d.ts`。
- 保留 `useDefineForClassFields: false`，维持旧版 TypeScript 类字段初始化语义。输出语法目标升级到 ES2018，未保留 IE11 支持。

## Worker 生命周期

`transmuxing-worker-entry.js` 显式调用原 Worker 初始化函数。主线程使用 `?worker&inline` 导入构造器，发布产物包含 Worker 的代码和依赖。开发环境由 Vite 提供模块 Worker，生产环境使用内联 IIFE Worker。

Worker 完成 controller 初始化后发送 `ready`。初始化期间的 start / stop / seek / pause / resume 命令先排队；收到 ready 后按序发送。构造失败、初始化错误或超时会终止 Worker、移除日志监听器，建立主线程 controller 并重放尚未执行的命令。

发送给 Worker 的媒体 URL（包括多分段 URL）按页面 `document.baseURI` 转为绝对地址，避免 Blob Worker 无法解析相对地址。复制数据源后再转换，不修改调用方传入的 URL。

Worker 在 ready 后报错会通过 IO_ERROR 上报，不自动重新转封装，以免重复追加媒体数据。销毁仍发送 destroy 请求，并设置终止兜底；尚未启动的 Worker 直接终止。

内联模式保持单脚本部署方式，但主线程回退代码和 Worker 代码分别打包，可能比旧方案更大。若以后改用独立 Worker，应重新测试 npm 二次打包、资源路径、CDN 和 CSP。

## 验证范围

Playwright 使用本地合成样本检查源码、ESM、UMD 的实际媒体播放、Worker 消息、PCM ArrayBuffer 输出、销毁重建和异步初始化失败回退。两个 Demo 改用源码 ESM 入口，保留 HTML 按钮的事件处理函数。

PCM 当前通过公共 `audio_segment` 事件输出，内置 Web Audio 喂数据逻辑原本已被注释，此迁移保持该行为。未新增 WASM 或 AudioWorklet；H.265、ARIB 字幕和外部直播服务需要对应素材与环境另行验证。

同时修复 PCM 解码分支直接调用 `self.postMessage` 的线程假设：改为通过 demuxer → controller → transmuxer 转发事件，由 Worker 入口负责 ArrayBuffer 转移，使主线程回退也能输出 PCM。
