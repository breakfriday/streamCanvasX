# StreamCanvasX

一个 Git 仓库、一个 pnpm workspace、一份根目录 Vite 配置。
`packages/player` 直接使用 `packages/playercore` 的源码，开发和构建都不需要先构建 core。

| 目录 | 包名 | 用途 |
| --- | --- | --- |
| `packages/player` | `@break_happy/streamcanvasx` | 对外播放器、PCM AudioWorklet、波形和 Canvas 渲染 |
| `packages/playercore` | `@break_happy/streamcanvasx-core` | 内部源码包，包含 IO、demux、remux、MSE 和 worker |
| `playground` | — | 本地联调页面 |
| `tests` | — | 跨包浏览器集成测试 |

## 开发与构建

使用 Node.js 20.19+（或 22.12+）、pnpm 11.5.0，在本目录运行：

```sh
pnpm install
pnpm dev
```

访问 `http://127.0.0.1:5173`。修改任意一个包的源码都由同一个 Vite 服务处理；
页面只有在点击“创建播放器”后才开始连接输入的视频地址。

```sh
pnpm build              # 直接从两个包的源码构建 player
pnpm build:watch        # 一个 Vite watcher 监听两个包
pnpm build:playground   # 静态联调页面，输出 dist/playground
pnpm preview            # 预览静态联调页面（需先 build:playground）
```

根 `vite.config.mts` 统一负责上层 legacy decorators/Inversify 元数据、core TypeScript、
`events` 浏览器入口、core 版本注入及内联 worker。AudioWorklet 保留现有 Blob 模块实现。
不再维护 core dist 或前后两个构建进程。

## 产物与发布

- `packages/player/dist/streamcanvasx.js`：包含 core 和内联 worker 的自包含 ESM。
- `packages/player/dist/streamcanvasx.d.ts`：既有手工维护的公共 API 声明。
- 根目录 `dist/streamcanvasx.js`、`dist/streamcanvasx.d.ts`：相同产物的镜像，便于静态 URL 交付和本地覆盖。

```sh
pnpm pack:player
```

生成 `dist/packages` 下的 npm tarball。实际发布对象只有 `packages/player`；根包和 core 都是 private。
core 作为 player 的 `workspace:*` 开发依赖，在构建时打进产物，消费者不需要安装未发布的 core。

```ts
import { createPlayerServiceInstance } from '@break_happy/streamcanvasx';

const player = createPlayerServiceInstance({
  url: 'https://media.example.internal/live.flv',
  contentEl: document.querySelector('#player')!,
});
player.createPlayer({});
```

静态 URL 交付时提供正确的 JavaScript MIME 和跨域响应头；宿主 CSP 需允许现有 Blob worker/worklet。
AQ 的本地覆盖可改指向本目录 `dist/streamcanvasx.js`，无需把播放器加入 AQ workspace。

## 检查

```sh
pnpm check              # workspace 边界 + core 类型检查
pnpm typecheck          # 包含上层全量检查，仍会报告历史类型错误
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome pnpm test
```

未指定浏览器路径时，需要先安装 Playwright Chromium。测试分别通过源码和最终 player ESM
验证 core 播放/生命周期以及上层 Canvas、PCM AudioWorklet 数据链路，不需要实际设备。

本轮不修改双 MediaSource、独立音视频时间轴、audio_segment PCM 格式或恢复策略。
原项目已有的上层 TypeScript 债务仍保留；公共声明不代表完整源码已通过类型检查。

原始两个项目仍保留在上级目录。复制进来的嵌套 `.git`、旧配置/锁文件和生成文件，已移到
上级 `_streamCanvasX_migration_backup_*` 目录。本仓库初始化为新的 Git 仓库，未创建提交或远程仓库；
历史仍可从原项目和备份读取。后续日常修改以本仓库的两个 packages 为准。

详细设计、迁移范围与验证边界见 [workspace 说明](docs/workspace.md)。
