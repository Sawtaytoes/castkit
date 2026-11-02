import { render, waitFor } from "@testing-library/preact"
import { expect, test } from "vitest"
import { page } from "vitest/browser"
import { idleActivityFixture } from "./__fixtures__/idleActivity.ts"
import { DisplayComposition } from "./PlatformApp.tsx"
import "../styles.css"
import "./platform.css"

test("idle Activity fits complete point names in a wide 1778 by 600 preview", async () => {
  await page.viewport(1778, 600)
  const { container } = render(
    <main class="platform">
      <DisplayComposition
        snapshot={idleActivityFixture()}
        isConnected
        onAction={async () => undefined}
      />
    </main>,
  )
  await document.fonts.ready
  await waitFor(() =>
    expect(
      container.querySelectorAll(".kids-points-card"),
    ).toHaveLength(3),
  )
  expect(
    container.querySelectorAll(".platform-panel"),
  ).toHaveLength(2)
  container
    .querySelectorAll<HTMLElement>(".kids-points-card")
    .forEach((card) => {
      const bounds = card.getBoundingClientRect()
      card
        .querySelectorAll<HTMLElement>(
          "h3,.kids-points-total,.kids-points-bar,.kids-points-footnote",
        )
        .forEach((part) => {
          const rect = part.getBoundingClientRect()
          expect(rect.top).toBeGreaterThanOrEqual(
            bounds.top,
          )
          expect(rect.bottom).toBeLessThanOrEqual(
            bounds.bottom,
          )
          const text = document.createRange()
          text.selectNodeContents(part)
          const clippingBottom =
            getComputedStyle(part).overflowY === "hidden"
              ? rect.bottom
              : bounds.bottom
          expect(
            text.getBoundingClientRect().bottom,
          ).toBeLessThanOrEqual(clippingBottom + 1)
        })
    })
})
