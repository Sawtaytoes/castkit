import { render, waitFor } from "@testing-library/preact"
import { expect, test } from "vitest"
import { page } from "vitest/browser"
import { sixAccountDeskSnapshot } from "./__fixtures__/sixAccountDesk.ts"
import { DisplayComposition } from "./PlatformApp.tsx"
import "../styles.css"
import "./platform.css"

test.each([
  { state: "idle", isPrinting: false },
  { state: "printing", isPrinting: true },
])("all six AI subscriptions finish inside the 1024 x 600 desk composition while $state", async ({
  isPrinting,
}) => {
  /*
   * Three Claude accounts, two Codex accounts, and SpaceXAI. The page is
   * sized to the desk, so the claim holds in every test window.
   */
  await page.viewport(1024, 600)
  const { container } = render(
    <main class="platform">
      <DisplayComposition
        snapshot={sixAccountDeskSnapshot({
          nowMs: Date.now(),
          isPrinting,
        })}
        isConnected
        onAction={async () => undefined}
      />
    </main>,
  )
  await document.fonts.ready
  await waitFor(() =>
    expect(
      container.querySelectorAll(
        ".ai-usage-provider-head h3",
      ),
    ).toHaveLength(6),
  )
  expect(
    Array.from(
      container.querySelectorAll(
        ".ai-usage-provider-head h3",
      ),
      (heading) => heading.textContent,
    ).toSorted(),
  ).toEqual([
    "Claude Avery",
    "Claude Jordan",
    "Claude Morgan",
    "Codex Alt Taylor",
    "Codex Avery",
    "SpaceXAI",
  ])
  expect(
    container.querySelector(".ai-usage-more"),
  ).toBeNull()
  const usage = container.querySelector(".ai-usage")
  const panel = usage?.closest(".platform-panel")
  if (!usage || !panel) {
    throw new Error("Missing the usage panel")
  }
  const panelBounds = panel.getBoundingClientRect()
  usage
    .querySelectorAll(".ai-usage-provider")
    .forEach((section) => {
      const bounds = section.getBoundingClientRect()
      expect(bounds.top).toBeGreaterThanOrEqual(
        panelBounds.top,
      )
      expect(bounds.bottom).toBeLessThanOrEqual(
        panelBounds.bottom + 1,
      )
      expect(bounds.left).toBeGreaterThanOrEqual(
        panelBounds.left,
      )
      expect(bounds.right).toBeLessThanOrEqual(
        panelBounds.right + 1,
      )
    })
})
