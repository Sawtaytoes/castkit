import { render } from "@testing-library/preact"
import { inject, test } from "vitest"
import { page } from "vitest/browser"
import { DisplayLoading } from "./DisplayLoading.tsx"
import "../styles.css"
import "./platform.css"

test("first load uses a quiet composition skeleton", async () => {
  await page.viewport(1024, 600)
  document.documentElement.dataset.scheme = "dark"
  render(<DisplayLoading />)
  await document.fonts.ready
  await page.screenshot({
    path: `${inject("vrtActualDir")}/platform/display-loading.png`,
    element: document.body,
  })
})
