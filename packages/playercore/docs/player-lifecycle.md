# 播放器生命周期

本轮调整处理重载、停止、销毁和监听器清理。双 MediaSource、音视频独立时间线、各自的直播追赶策略，以及 `audio_segment` 的 ArrayBuffer 参数保持原样。

## 重载与停止

`reload()` 会保存当前视频和音频元素，停止旧加载、释放旧 MSE，再重新绑定。新的视频 MSE 触发 `sourceopen` 后才开始加载，并自动播放。`safeReolad()` 保留现有拼写，作为同一流程的兼容入口。

连续重载只允许当前绑定的回调启动加载，旧 MSE 的延迟事件和旧 Transmuxer 的数据不会进入新的会话。不再固定等待一秒。

- `unload()`：停止加载和播放，取消待加载、待重载、seek 和缓冲检查任务，保留已绑定的媒体元素与 MSE，后续可再次 `load()`。
- `detachMediaElement()`：先停止，再释放两路 MSE、解绑监听器、清除元素引用。后续需要重新 `attachMediaElement()`。
- `destroy()`：完整释放实例。重复调用安全；销毁后仍可调用 `unload()`、`detachMediaElement()`、`pause()`、`off()` 做兜底清理，但重新加载或绑定会明确报错。
- 等待重载的 `sourceopen` 期间调用 `pause()`，可以取消此次重载的自动播放，但仍允许加载；调用 `unload()` 则取消整个待加载任务。

已进入队列、但尚未创建 SourceBuffer 的初始化段和媒体段，也会在停止时清除。已经关闭的 MediaSource 所关联的 SourceBuffer 监听器仍会被解绑。

## 事件兼容性

`defatulEvent()` 继续作为解码错误自动恢复的显式启用入口。可在绑定前调用，重复调用不会增加重复监听器。启用状态在重新绑定后保留，停止或销毁后不因旧错误事件重新加载。

新订阅 `MEDIA_INFO` 或 `STATISTICS_INFO` 时，只向这个订阅者补发缓存值；已取消订阅、停止或销毁后，未执行的缓存回调会失效。

## 验证

运行 `pnpm build` 后执行 `pnpm test`。浏览器测试覆盖源码、ESM 和 UMD，以及主线程、Worker、双 MediaSource 场景。回归项包含连续重载、sourceopen 前停止、取消延迟任务、重复/重入销毁、监听器去重与解绑、过期数据回调、停止前的待追加队列和既有 FLV / MPEG-TS / PCM 行为。
