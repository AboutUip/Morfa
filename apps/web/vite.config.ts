import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { xaiopSourcePlugin } from "../../scripts/vite-plugin-xaiop.mjs";

export default defineConfig({
  plugins: [xaiopSourcePlugin(), react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
  },
  build: {
    target: "es2022",
  },
});
