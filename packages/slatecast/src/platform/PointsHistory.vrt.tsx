import { render } from "@testing-library/preact"
import { afterEach, inject, test } from "vitest"
import { page } from "vitest/browser"
import { pointsHistoryFixture } from "./fixtures.ts"
import { DisplayComposition } from "./PlatformApp.tsx"
import "../styles.css"
import "./platform.css"

afterEach(() => page.viewport(414, 896))

test.each([
  { width: 480, height: 320, theme: "light" as const },
  { width: 480, height: 320, theme: "dark" as const },
  { width: 250, height: 122, theme: "light" as const },
  { width: 250, height: 122, theme: "dark" as const },
])("points history at $width by $height in $theme", async ({
  width,
  height,
  theme,
}) => {
  await page.viewport(width, height)
  document.documentElement.dataset.scheme = theme
  const snapshot = pointsHistoryFixture()
  render(
    <main
      class="platform"
      style={{ position: "fixed", inset: 0 }}
      data-scheme={theme}
    >
      <DisplayComposition
        snapshot={{
          ...snapshot,
          view: { ...snapshot.view, theme },
        }}
        isConnected
        onAction={async () => undefined}
      />
    </main>,
  )
  await document.fonts.ready
  await new Promise((resolve) =>
    requestAnimationFrame(() =>
      requestAnimationFrame(resolve),
    ),
  )
  await page.screenshot({
    path: `${inject("vrtActualDir")}/platform/points-history-${width}x${height}-${theme}.png`,
    element: document.body,
  })
})
