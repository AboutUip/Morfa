import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";

import App from "./app/App";
import { AuthProvider } from "./features/auth/AuthProvider";
import { RenderPage } from "./features/render/RenderPage";
import { startBootScheduler } from "./lib/boot";
import { i18n, initI18n } from "./lib/i18n";
import { ThemeProvider } from "./lib/theme";
import "./styles/index.css";

// `/render/<token>` is a standalone screenshot surface. It must not bootstrap
// the authenticated app (boot requests, splash screen or auth provider), but it
// still needs the shared global styles, theme tokens and i18n.
const renderMatch = /^\/render\/([^/]+)\/?$/.exec(window.location.pathname);

if (renderMatch) {
  for (const element of [
    document.documentElement,
    document.body,
  ]) {
    element.style.margin = "0";
    element.style.padding = "0";
    element.style.overflow = "hidden";
  }
  document.body.style.background = "#ffffff";
} else {
  // 开屏期间尽早开始拉取登录状态、偏好等启动数据。
  startBootScheduler();
}

await initI18n();

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root container #root was not found");
}

const root = createRoot(container);

if (renderMatch) {
  root.render(
    <I18nextProvider i18n={i18n}>
      <RenderPage token={decodeURIComponent(renderMatch[1])} />
    </I18nextProvider>,
  );
} else {
  root.render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ThemeProvider>
      </I18nextProvider>
    </StrictMode>,
  );
}
