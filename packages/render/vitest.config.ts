import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**"],
    name: "render",
    include: ["src/**/*.test.ts"],
  },
})
