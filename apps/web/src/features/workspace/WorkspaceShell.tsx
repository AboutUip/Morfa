import styles from "./WorkspaceShell.module.css";
import { CanvasStage } from "./CanvasStage";
import { Inspector } from "./Inspector";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function WorkspaceShell() {
  return (
    <div className={styles.shell}>
      <TopBar />
      <div className={styles.body}>
        <Sidebar />
        <CanvasStage />
        <Inspector />
      </div>
    </div>
  );
}
