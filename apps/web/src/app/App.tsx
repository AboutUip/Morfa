import { LoadingOverlay } from "../components/LoadingOverlay";
import { useBootstrap } from "../features/bootstrap/useBootstrap";
import { ProjectsPage } from "../features/projects/ProjectsPage";
import { useVisualViewport } from "../lib/useVisualViewport";

export default function App() {
  const { controller, status, retry } = useBootstrap();
  useVisualViewport();

  if (status === "success") {
    return <ProjectsPage />;
  }

  return <LoadingOverlay controller={controller} onRetry={retry} />;
}
