# 源码 workspace 的边界

根目录只有一份 `vite.config.mts`。包内不维护单独的 Vite 配置、安装锁文件或 Git 仓库。

## 依赖和构建

`packages/playercore` 保留原包名 `@break_happy/streamcanvasx-core`，标记为 private，
`exports.import` 指向 `src/index.js`。`packages/player` 将它声明为 `workspace:*` 开发依赖，
直接使用包入口导入源码，不依赖其他仓库的路径或 core 的 dist。

root Vite 统一处理这两个包。开发时禁用 core 的依赖预打包以保持源码/worker 的更新可见；
构建时将 core 一起打入最终 player ESM。core 的 `events` 浏览器适配和版本 define 同时应用于
主线程和 worker；上层的装饰器转换限制在 player 源码内，core 保留自己的 TS 编译语义。

只有一个 Vite watcher；修改 core 源码会直接触发最终 player 重建。
生成文件只在 player/dist 和根 dist，不需要 core 的预构建、watch 进程或中间产物。
根 dist 镜像在成功写出 bundle 后原子替换，方便静态服务和 AQ 本地覆盖读取。

core 是构建时依赖。发布 player 时它不会进入消费者的运行时 dependencies，
无需向 npm 发布私有 core。公开 `.d.ts` 仍由 player/public 手工维护，不引用 core 内部类型路径。

## 这次保留的行为

core 的运行时代码没有改动；上层运行时代码只统一了五处文件中的 core 导入。
原有用户修改、双 MediaSource、独立音视频时间轴、audio_segment PCM 事件、AudioWorklet、
Canvas 和已有 WebCodecs/WASM/WebRTC 分支保持原样。playground 补齐了创建实例之后实际开始拉流的调用。

包的职责仍有历史重叠：core 包含 MSE 播放，上层也有部分 demux/decoder 实现。
本轮不进行播放引擎拆分或错误恢复改造。

## 验证

浏览器测试使用两种入口：直接 core 源码，以及最终 player ESM 导出的 streamcanvasCore。
原来的独立 core ESM/UMD 测试矩阵转换为上述两种入口，覆盖 46 项 core 播放/生命周期测试；
另有 8 项跨包测试，覆盖 worker、上层 Canvas 视频、PCM 到 AudioWorklet/Analyser 的数据链路。

合成媒体在仓库内，不依赖实际 IoT 设备。PCM 边界测试预先初始化 AudioWorklet，
随后把 core 的 audio_segment 接入上层音频输出；不代表所有 PCM 业务分支已经没有历史问题。
已有上层路径仍可能在没有 MSE 音频片段时尝试播放空的音频 MediaSource，首次音频初始化也存在
异步时序需要后续单独处理。

迁移前后上层全量 TypeScript 检查都是 951 项诊断，没有新增；`pnpm typecheck` 仍如实失败。
`pnpm check` 只表示 workspace 约束和 core 类型检查通过，不替代上层全量检查。

## Git 与旧项目

新根仓库已初始化，未提交、未设置远程、未发布。原始两个项目留在上级目录。
复制进来的嵌套 Git 元数据及旧配置/产物保存在上级 `_streamCanvasX_migration_backup_*` 中。
后续以这个 workspace 为开发入口，避免在原目录和新目录分别修改同一份实现。
