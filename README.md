# StreamCanvasX

面向 IoT 监控场景的浏览器播放器，提供 FLV 播放、PCM 音频播放、波形展示和 Canvas 视频渲染。

## 本地开发

需要 Node.js 20（≥20.19）或 22.12+、pnpm 11.5.0。以下命令在项目根目录执行：

```bash
pnpm install
pnpm dev
```

打开 http://127.0.0.1:5173，输入流地址，点击“创建播放器”进行调试。

## 构建

```bash
pnpm build              # 构建播放器
pnpm build:watch        # 监听源码变化并自动构建
pnpm build:playground   # 构建静态调试页面
pnpm preview            # 预览静态调试页面
```

播放器产物位于 `packages/player/dist/`，同时同步到根目录 `dist/`。
静态调试页面位于 `dist/playground/`，预览地址为 http://127.0.0.1:4173。

## 使用

安装播放器包：

```bash
pnpm add @break_happy/streamcanvasx
```

准备一个有尺寸的容器：

```html
<div id="player" style="width: 640px; height: 360px"></div>
```

在页面入口中创建播放器，将 `url` 替换为实际流地址：

```ts
import { createPlayerServiceInstance } from '@break_happy/streamcanvasx';

const player = createPlayerServiceInstance({
  url: 'https://example.com/live.flv',
  contentEl: document.querySelector<HTMLElement>('#player')!,
  streamType: 'flv',
  isLive: true,
});

player.createPlayer({});

// 页面退出或不再使用时调用：player.destroy();
```

## 发布 npm 包

更新 `packages/player/package.json` 的版本号并提交改动后，在项目根目录执行：

```bash
npm login
pnpm --filter @break_happy/streamcanvasx publish --access public
```

发布命令会自动构建，只发布 `packages/player`。
