import { precompressAssets } from "@charcuterie/server/vite"
import { createViteConfig } from "@charcuterie/vite-config"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"

export default createViteConfig({
  base: "/manage/",
  plugins: [react(), tailwindcss(), precompressAssets()],
  resolve: { dedupe: ["react", "react-dom"] },
  server: {
    port: Number(process.env.CASTKIT_ADMIN_PORT ?? 5189),
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:8788" },
  },
})
