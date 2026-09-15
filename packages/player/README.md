# @break_happy/streamcanvasx

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
import { createPlayerServiceInstance } from "@break_happy/streamcanvasx";

const player = createPlayerServiceInstance({
  url: "https://example.com/live.flv",
  contentEl: document.querySelector<HTMLElement>("#player")!,
  streamType: "flv",
  isLive: true,
});

player.createPlayer({});

// 页面退出或不再使用时调用：player.destroy();
```

### 直播重连与错误回调

下面是更完整的 JavaScript 接入示例，替换上面的最小示例使用。`deviceOnline` 由业务的设备状态通知更新：

```js
import { createPlayerServiceInstance } from "@break_happy/streamcanvasx";

let deviceOnline = true;

const player = createPlayerServiceInstance({
  url: "https://example.com/live.flv",
  contentEl: document.querySelector("#player"),
  streamType: "flv",
  isLive: true, // 直播异常时自动进入重连流程
  hasVideo: true,
  hasAudio: true,
  isMuted: true, // 初始静音
  stopCallBack: async () => ({
    // 重连时查询业务状态，决定是否停止
    stop: !deviceOnline,
    message: deviceOnline ? "" : "设备已离线",
  }),
});

// 实例属性，不是构造配置项；当前默认值也是 100000。
player.maxErrorTimes = 100000;

player.on("mediaInfo", ({ hasVideo, hasAudio }) => {
  console.log("媒体轨道", { hasVideo, hasAudio });
});

player.createPlayer({});

// 当前 FLV 错误事件在 corePlayer 上订阅。
// 此处用于业务提示、日志上报；播放器自身已经处理自动重连。
const core = player.corePlayer;
const onError = (type, detail, info) => {
  console.error("播放异常", { type, detail, info });
};
core.on("error", onError);

// 在业务收到设备重新上线通知时调用。
function onDeviceOnline() {
  deviceOnline = true;
  player.forceReload();
}

// 页面或组件卸载时调用。
function dispose() {
  core.off("error", onError);
  player.destroy();
}
```

直播恢复成功后会清零失败计数。当前实现是最多连续失败 `100000` 次的持续重连，尚没有独立的“无限重连”配置；不要将上限设为 `Infinity`，现有停止逻辑依赖计数超过上限。

`stopCallBack` 是重连时的业务停止回调，不接收错误详情；错误详情通过 `core.on('error', ...)` 获取。当前重连流程不会等待这个异步回调，因此返回 `stop: true` 可以停止播放和后续重连，但不能保证阻止本次请求发出。

### 静音、增益与画面操作

播放器创建、相应音视频链路就绪后，在按钮或滑块的事件中调用：

| 操作                               | 调用                                                         |
| ---------------------------------- | ------------------------------------------------------------ |
| 静音                               | `player.audioProcessingService.mute(true)`                   |
| 取消静音                           | `player.audioProcessingService.mute(false)`                  |
| 调整增益                           | `player.audioProcessingService.setGain(1.5)`，`1` 为原始增益 |
| 再旋转 90°                         | `player.canvasVideoService.drawRotate(90)`                   |
| 重置旋转（当前实现有限制，见下文） | `player.canvasVideoService.rotateReset()`                    |
| 水平镜像                           | `player.canvasVideoService.drawHorizontalMirror()`           |
| 垂直镜像                           | `player.canvasVideoService.drawVerticalMirror()`             |
| 重置镜像                           | `player.canvasVideoService.transformReset()`                 |
| 裁剪填满容器                       | `player.canvasVideoService.setCover(true)`                   |
| 手动重新连接                       | `player.forceReload()`                                       |
| 销毁播放器                         | `player.destroy()`                                           |
