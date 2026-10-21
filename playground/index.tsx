import { createRoot } from "react-dom/client";
import DemoComponent from "./demoComponet";

function PlaygroundPage() {
  return (
    <main>
      <h1>StreamCanvasX 本地调试</h1>
      <p>输入一个可访问的 FLV 地址后再创建播放器；页面加载本身不会连接视频流。</p>
      <DemoComponent />
    </main>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<PlaygroundPage />);

if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
