import { createRoot } from "react-dom/client";
import styles from "./index.module.css";
import DemoComponent from "./demoComponet";

function PlaygroundPage() {
  return (
    <main className={styles.page}>
      <header className={styles.masthead}>
        <div className={styles.brand}>
          <div>
            <h1>StreamCanvasX</h1>
          </div>
        </div>
      </header>
      <DemoComponent />
    </main>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<PlaygroundPage />);

if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
