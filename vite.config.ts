import { defineConfig } from "vite";

// Builds the desktop shell frontend (shell/), NOT the Next.js app.
// The shell is the thin Tauri window that hosts the pi-web UI via iframe.
export default defineConfig({
  root: "shell",
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: process.env.TAURI_ENV_DEBUG ? false : "esbuild",
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    outDir: "../dist",
    emptyOutDir: true,
  },
});
