import { render, waitFor } from "@testing-library/preact"
import { expect, test } from "vitest"
import { pointsOverviewFixture } from "./__fixtures__/pointsOverview.ts"
import { DisplayComposition } from "./PlatformApp.tsx"
import "../styles.css"
import "./platform.css"

// Each case runs at the enclosing narrow, tall, wide and ultrawide window.
test.each([
  false,
  true,
])("points remain visible as work starts and stops (rip only: %s)", async (isRipOnly) => {
  const content = (isBusy: boolean, isRunning: boolean) => (
    <main class="platform" data-device="true">
      <DisplayComposition
        snapshot={pointsOverviewFixture({
          isBusy,
          isRunning,
          isRipOnly,
        })}
        isConnected
        onAction={async () => undefined}
      />
    </main>
  )
  const { container, rerender } = render(
    content(false, false),
  )
  await document.fonts.ready
  await waitFor(() => {
    expect(
      container.querySelector(".kids-points"),
    ).not.toBeNull()
    expect(
      container.querySelector(".kids-points-summary"),
    ).toBeNull()
  })
  rerender(content(true, false))
  await waitFor(() => {
    expect(
      container.querySelectorAll(
        ".kids-points-summary-child",
      ),
    ).toHaveLength(3)
  })
  const pointsPanel = container.querySelector<HTMLElement>(
    "[data-spec='kids-points']",
  )!
  const workPanel = container.querySelector<HTMLElement>(
    `[data-spec='${isRipOnly ? "rip-deck" : "printer-status"}']`,
  )!
  await waitFor(() => {
    const workBox = workPanel.getBoundingClientRect()
    const pointsBox = pointsPanel.getBoundingClientRect()
    expect(workBox.bottom).toBeLessThanOrEqual(
      pointsBox.top,
    )
    expect(workBox.height).toBeGreaterThan(pointsBox.height)
  })
  const idleHeight =
    pointsPanel.getBoundingClientRect().height
  // Names, not initials: the initial alone is for a cell too narrow for one.
  expect(
    Array.from(
      container.querySelectorAll<HTMLElement>(
        ".kids-points-summary-values h3",
      ),
    ).map((name) => name.innerText),
  ).toEqual(["Robin", "Sky", "Quinn"])
  // Each child starts with its own identity stripe.
  expect(
    Array.from(
      container.querySelectorAll<HTMLElement>(
        ".kids-points-summary-child",
      ),
    ).map(
      (child) =>
        getComputedStyle(child).borderInlineStartColor,
    ),
  ).toEqual([
    "rgb(38, 155, 83)",
    "rgb(63, 127, 224)",
    "rgb(217, 80, 63)",
  ])
  rerender(content(true, true))
  await waitFor(() => {
    expect(
      pointsPanel.getBoundingClientRect().height,
    ).toBeGreaterThan(idleHeight)
    expect(
      container.querySelector(
        ".kids-points-summary-child[data-running='true']",
      ),
    ).toHaveTextContent("130")
  })
  pointsPanel
    .querySelectorAll("h3, strong, p")
    .forEach((part) => {
      const bounds = part.getBoundingClientRect()
      const panel = pointsPanel.getBoundingClientRect()
      expect(bounds.bottom).toBeLessThanOrEqual(
        panel.bottom,
      )
      expect(bounds.right).toBeLessThanOrEqual(panel.right)
    })
  rerender(content(false, true))
  await waitFor(() => {
    expect(
      container.querySelector(".kids-points-summary"),
    ).toBeNull()
    expect(
      container.querySelector(".kids-points"),
    ).toHaveTextContent("130")
  })
})

test("a child opened from the busy strip takes the whole composition", async () => {
  const { container } = render(
    <main class="platform" data-device="true">
      <DisplayComposition
        snapshot={pointsOverviewFixture({ isBusy: true })}
        isConnected
        onAction={async () => undefined}
      />
    </main>,
  )
  await document.fonts.ready
  await waitFor(() => {
    expect(
      container.querySelectorAll(
        ".kids-points-summary-child",
      ),
    ).toHaveLength(3)
  })
  container
    .querySelector<HTMLButtonElement>(
      '[aria-label="View Robin\'s tasks today"]',
    )!
    .click()
  const layout = container.querySelector<HTMLElement>(
    ".platform-layout",
  )!
  await waitFor(() => {
    const overlay = container.querySelector<HTMLElement>(
      ".kids-points-overlay",
    )
    expect(overlay).not.toBeNull()
    const overlayBox = overlay!.getBoundingClientRect()
    const layoutBox = layout.getBoundingClientRect()
    expect(overlayBox.width).toBeCloseTo(layoutBox.width, 0)
    expect(overlayBox.height).toBeCloseTo(
      layoutBox.height,
      0,
    )
    expect(overlay).toHaveTextContent("Robin")
  })
  // The strip stays underneath, so going back returns to it unchanged.
  expect(
    container.querySelectorAll(
      ".kids-points-summary-child",
    ),
  ).toHaveLength(3)
  container
    .querySelector<HTMLButtonElement>(
      "[aria-label='Back to all children']",
    )!
    .click()
  await waitFor(() => {
    expect(
      container.querySelector(".kids-points-overlay"),
    ).toBeNull()
  })
})
