import { LoadingScreen } from "../features/bootstrap/LoadingScreen";
import { useBootstrap } from "../features/bootstrap/useBootstrap";
import { ProjectsPage } from "../features/projects/ProjectsPage";

export default function App() {
  const { status, progress, taskLabelKey, error, retry } = useBootstrap();

  if (status === "ready") {
    return <ProjectsPage />;
  }

  return (
    <LoadingScreen
      progress={progress}
      taskLabelKey={taskLabelKey}
      status={status === "error" ? "error" : "loading"}
      error={error}
      onRetry={retry}
    />
  );
}
