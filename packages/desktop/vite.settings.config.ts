import { fileURLToPath } from "node:url"
import { createViteConfig } from "@charcuterie/vite-config"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"

// The settings window's page: React with Charcuterie, like CastKit's admin
// app. It loads from a file inside the packaged app, so every asset path is
// relative, and the runtime is Electron's own Chromium.
export default createViteConfig({
  root: fileURLToPath(
    new URL("src/settings", import.meta.url),
  ),
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: { dedupe: ["react", "react-dom"] },
  build: {
    outDir: fileURLToPath(
      new URL("dist/settings", import.meta.url),
    ),
    emptyOutDir: true,
    target: "esnext",
  },
})
