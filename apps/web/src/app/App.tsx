import { useState } from "react";

import { SplashScreen } from "../components/SplashScreen";
import { ProjectsPage } from "../features/projects/ProjectsPage";
import { useVisualViewport } from "../lib/useVisualViewport";

export default function App() {
  const [splashVisible, setSplashVisible] = useState(true);
  useVisualViewport();

  return (
    <>
      <ProjectsPage />
      {splashVisible ? (
        <SplashScreen onComplete={() => setSplashVisible(false)} />
      ) : null}
    </>
  );
}
