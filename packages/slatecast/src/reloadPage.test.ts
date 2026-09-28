import { describe, expect, test, vi } from "vitest"
import { reloadWhenPageAnswers } from "./reloadPage.ts"

describe("reloadWhenPageAnswers", () => {
  test("reloads at once when the page answers", async () => {
    const reload = vi.fn()
    const wait = vi.fn(async () => {})
    await reloadWhenPageAnswers({
      isPageAnswering: async () => true,
      reload,
      wait,
    })
    expect(reload).toHaveBeenCalledTimes(1)
    expect(wait).not.toHaveBeenCalled()
  })

  test("waits through a proxy error and reloads only when the page answers", async () => {
    // A deploy: the proxy answers 502 while the container restarts. Reloading
    // then would leave the panel on the proxy's page, which never retries.
    const answers = [false, false, false, true]
    const reload = vi.fn()
    const wait = vi.fn(async () => {
      expect(reload).not.toHaveBeenCalled()
    })
    await reloadWhenPageAnswers({
      isPageAnswering: async () => answers.shift() ?? true,
      reload,
      wait,
    })
    expect(wait).toHaveBeenCalledTimes(3)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
