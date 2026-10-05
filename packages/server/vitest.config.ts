import { createCiTimeouts } from "@charcuterie/vitest-config"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**"],
    name: "server",
    include: ["src/**/*.test.ts"],
    // The root run shares the runner with `slatecast`'s four browser windows,
    // and two plugin tests that take 75–290 ms alone timed out at the node
    // default 5 s beside them. A project listed in the root config does not
    // inherit the root's CI budget, so it names it here.
    ...createCiTimeouts(),
  },
})
