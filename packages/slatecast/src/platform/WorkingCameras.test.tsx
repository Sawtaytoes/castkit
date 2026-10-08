import { render, waitFor } from "@testing-library/preact"
import { expect, test } from "vitest"
import { page } from "vitest/browser"
import { workingCameraSnapshot } from "./__fixtures__/workingCameras.ts"
import { DisplayComposition } from "./PlatformApp.tsx"
import "../styles.css"
import "./platform.css"

test.each([
  0.75, 1, 1.25, 1.5, 2,
])("camera-focused composition keeps quotas below at %s browser scale", async (scale) => {
  await page.viewport(
    Math.round(1984 / scale),
    Math.round(1184 / scale),
  )
  document.documentElement.dataset.scheme = "dark"
  render(
    <main class="platform">
      <DisplayComposition
        snapshot={workingCameraSnapshot}
        isConnected
        onAction={async () => undefined}
      />
    </main>,
  )
  await document.fonts.ready
  await waitFor(() => {
    const cards = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".printer-card",
      ),
    )
    expect(cards).toHaveLength(2)
    const usage =
      document.querySelector<HTMLElement>(".ai-usage")!
    const usageBounds = usage.getBoundingClientRect()
    expect(usageBounds.height).toBeLessThan(150)
    expect(usage.querySelector(".ai-usage-more")).toBeNull()
    expect(
      usage.querySelectorAll(".ai-usage-window"),
    ).toHaveLength(3)
    cards.forEach((card) => {
      const bounds = card.getBoundingClientRect()
      expect(usageBounds.top).toBeGreaterThan(bounds.bottom)
      expect(card.querySelector(".is-filament")).toBeNull()
      const image = card.querySelector<HTMLImageElement>(
        ".platform-printer-image",
      )!
      expect(image.complete).toBe(true)
      expect(image.naturalWidth).toBeGreaterThan(0)
      const media = card.querySelector<HTMLElement>(
        ".platform-printer-media",
      )!
      const visibleWidth = Math.min(
        media.clientWidth,
        (media.clientHeight * image.naturalWidth) /
          image.naturalHeight,
      )
      expect(visibleWidth).toBeGreaterThan(
        card.clientWidth * 0.8,
      )
      card
        .querySelectorAll<HTMLElement>(
          ".printer-action, .printer-band",
        )
        .forEach((control) => {
          const controlBounds =
            control.getBoundingClientRect()
          expect(controlBounds.bottom).toBeLessThanOrEqual(
            bounds.bottom + 1,
          )
          expect(controlBounds.right).toBeLessThanOrEqual(
            bounds.right + 1,
          )
          expect(
            control.clientHeight,
          ).toBeGreaterThanOrEqual(44)
        })
    })
  })
})
