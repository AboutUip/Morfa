import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";

import App from "./app/App";
import { AuthProvider } from "./features/auth/AuthProvider";
import { i18n, initI18n } from "./lib/i18n";
import { ThemeProvider } from "./lib/theme";
import "./styles/index.css";

await initI18n();

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root container #root was not found");
}

createRoot(container).render(
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
