import { createCiTimeouts } from "@charcuterie/vitest-config"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**"],
    name: "render",
    include: ["src/**/*.test.ts"],
    // Each project owns its budget; root CI timeouts do not propagate here.
    ...createCiTimeouts(),
  },
})
