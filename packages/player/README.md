# @break_happy/streamcanvasx

对外播放器包，负责上层编排、PCM AudioWorklet 输出、波形与 Canvas 渲染。

在 workspace 根目录运行 `pnpm dev`、`pnpm build`、`pnpm build:watch`。
在本目录运行同名命令也会转发到根目录，统一使用一份 Vite 配置。

`@break_happy/streamcanvasx-core` 是 workspace 开发依赖，其入口直接指向源码；
构建时已内联进本包，不需要提前构建或单独发布 core。

产物为 `dist/streamcanvasx.js` 和 `dist/streamcanvasx.d.ts`；公共声明仍为手工维护。
业务 API 说明保留在 `docs/`，完整开发说明见仓库根 README。

打包包含 core 的 Apache-2.0 许可文本：`dist/licenses/playercore-LICENSE.txt`。
