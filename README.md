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

### 直播重连与错误回调

下面是更完整的 JavaScript 接入示例，替换上面的最小示例使用。`deviceOnline` 由业务的设备状态通知更新：

```js
import { createPlayerServiceInstance } from '@break_happy/streamcanvasx';

let deviceOnline = true;

const player = createPlayerServiceInstance({
  url: 'https://example.com/live.flv',
  contentEl: document.querySelector('#player'),
  streamType: 'flv',
  isLive: true,                  // 直播异常时自动进入重连流程
  hasVideo: true,
  hasAudio: true,
  isMuted: true,                // 初始静音
  stopCallBack: async () => ({  // 重连时查询业务状态，决定是否停止
    stop: !deviceOnline,
    message: deviceOnline ? '' : '设备已离线',
  }),
});

// 实例属性，不是构造配置项；当前默认值也是 100000。
player.maxErrorTimes = 100000;

player.on('mediaInfo', ({ hasVideo, hasAudio }) => {
  console.log('媒体轨道', { hasVideo, hasAudio });
});

player.on('otherInfo', ({ speed, decodedFrames, droppedFrames }) => {
  console.log('接收速度', speed, 'KB/s');
  // 帧数统计为累计值，部分播放链路可能不提供这两个字段。
  console.log('累计帧数', decodedFrames, '累计丢帧', droppedFrames);
});

// 事件名沿用当前拼写 performaceInfo。
player.on('performaceInfo', ({ fps, duringtime }) => {
  console.log('当前 FPS', Number(fps));
  console.log('运行时长', duringtime);
});

player.createPlayer({});

// 当前 FLV 错误事件在 corePlayer 上订阅。
// 此处用于业务提示、日志上报；播放器自身已经处理自动重连。
const core = player.corePlayer;
const onError = (type, detail, info) => {
  console.error('播放异常', { type, detail, info });
};
core.on('error', onError);

// 在业务收到设备重新上线通知时调用。
function onDeviceOnline() {
  deviceOnline = true;
  player.forceReload();
}

// 页面或组件卸载时调用。
function dispose() {
  core.off('error', onError);
  player.destroy();
}
```

直播恢复成功后会清零失败计数。当前实现是最多连续失败 `100000` 次的持续重连，尚没有独立的“无限重连”配置；不要将上限设为 `Infinity`，现有停止逻辑依赖计数超过上限。

`stopCallBack` 是重连时的业务停止回调，不接收错误详情；错误详情通过 `core.on('error', ...)` 获取。当前重连流程不会等待这个异步回调，因此返回 `stop: true` 可以停止播放和后续重连，但不能保证阻止本次请求发出。

### 静音、增益与画面操作

播放器创建、相应音视频链路就绪后，在按钮或滑块的事件中调用：

| 操作 | 调用 |
| --- | --- |
| 静音 | `player.audioProcessingService.mute(true)` |
| 取消静音 | `player.audioProcessingService.mute(false)` |
| 调整增益 | `player.audioProcessingService.setGain(1.5)`，`1` 为原始增益 |
| 再旋转 90° | `player.canvasVideoService.drawRotate(90)` |
| 重置旋转（当前实现有限制，见下文） | `player.canvasVideoService.rotateReset()` |
| 水平镜像 | `player.canvasVideoService.drawHorizontalMirror()` |
| 垂直镜像 | `player.canvasVideoService.drawVerticalMirror()` |
| 重置镜像 | `player.canvasVideoService.transformReset()` |
| 裁剪填满容器 | `player.canvasVideoService.setCover(true)` |
| 手动重新连接 | `player.forceReload()` |
| 销毁播放器 | `player.destroy()` |

`setGain()` 当前只调节 `audioProcessingService` 的增益节点；G.711/PCM 使用独立的 AudioWorklet 播放链路，静音已接入，但增益尚未与这个方法联动。旋转、镜像适用于 Canvas 视频渲染。

`rotateReset()` 当前直接重置 Canvas 变换矩阵，会同时取消画面上的镜像，但没有同步清零内部的旋转角度和镜像状态。后续再旋转、镜像或裁剪填充可能出现异常，尚不能作为保留镜像的独立旋转重置使用。

上述完整示例使用 JavaScript；当前 npm 包的公开 TypeScript 声明尚未完整描述这些控制方法，TypeScript 接入需要补齐对应声明。

## 发布 npm 包

更新 `packages/player/package.json` 的版本号并提交改动后，在项目根目录执行：

```bash
npm login
pnpm --filter @break_happy/streamcanvasx publish --access public
```

发布命令会自动构建，只发布 `packages/player`。
