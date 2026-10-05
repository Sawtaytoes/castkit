import "@testing-library/jest-dom/vitest"
import { viewports } from "@charcuterie/vitest-config/viewports.js"
import { cleanup } from "@testing-library/preact"
import { afterEach, inject } from "vitest"
import { page } from "vitest/browser"

afterEach(async () => {
  cleanup()
  /*
   * Hand the window back. A test that sizes the page to a panel with
   * `page.viewport()` is right to — Slatecast lays out in `vw`/`vh`, so the
   * viewport IS the panel — but the size outlives the test, and every later
   * test in the file would quietly run at that panel instead of the window
   * its instance names. The VRT capture provides no window, and keeps its
   * own.
   */
  const window = inject("viewport")
  if (window) {
    await page.viewport(
      viewports[window].width,
      viewports[window].height,
    )
  }
})
