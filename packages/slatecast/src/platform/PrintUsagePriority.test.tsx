import { render, waitFor } from "@testing-library/preact"
import { expect, test } from "vitest"
import { page } from "vitest/browser"
import { prioritySnapshot } from "./__fixtures__/priorityComposition.ts"
import { DisplayComposition } from "./PlatformApp.tsx"
import "../styles.css"
import "./platform.css"

test.each([
  1.5, 2.5,
])("progress and all three subscriptions remain whole at %s scale", async (scale) => {
  await page.viewport(1024, 600)
  render(
    <main
      class="platform"
      style={{
        zoom: scale,
        width: `${1024 / scale}px`,
        height: `${600 / scale}px`,
        padding: "6px",
      }}
    >
      <DisplayComposition
        snapshot={prioritySnapshot}
        isConnected
        onAction={async () => undefined}
      />
    </main>,
  )
  await document.fonts.ready
  await waitFor(() => {
    const card =
      document.querySelector<HTMLElement>(".printer-card")!
    const remaining = card.querySelector<HTMLElement>(
      ".printer-band-remaining",
    )!
    expect(remaining.textContent).toBe("25m left")
    expect(remaining.scrollWidth).toBeLessThanOrEqual(
      remaining.clientWidth,
    )
    const bounds = card.getBoundingClientRect()
    card
      .querySelectorAll<HTMLElement>(
        ".printer-band, .printer-action",
      )
      .forEach((element) => {
        const content = element.getBoundingClientRect()
        expect(content.bottom).toBeLessThanOrEqual(
          bounds.bottom + 1,
        )
        expect(content.right).toBeLessThanOrEqual(
          bounds.right + 1,
        )
        expect(content.top).toBeGreaterThanOrEqual(
          bounds.top - 1,
        )
      })
    const camera = card.querySelector<HTMLElement>(
      ".platform-printer-media",
    )!
    expect(
      camera.getBoundingClientRect().height,
    ).toBeGreaterThanOrEqual(56 * scale - 1)
    const usage =
      document.querySelector<HTMLElement>(".ai-usage")!
    expect(
      Array.from(usage.querySelectorAll("h3")).map(
        (heading) => heading.textContent,
      ),
    ).toStrictEqual(["Claude", "Codex 1", "Codex 2"])
    expect(usage.querySelector(".ai-usage-more")).toBeNull()
    document
      .querySelectorAll<HTMLElement>(".platform-panel")
      .forEach((panel) => {
        expect(panel.scrollHeight).toBeLessThanOrEqual(
          panel.clientHeight + 1,
        )
        expect(panel.scrollWidth).toBeLessThanOrEqual(
          panel.clientWidth + 1,
        )
      })
    if (scale === 2.5) {
      const model = card
        .querySelector(".printer-job")
        ?.getBoundingClientRect()
      const controls = card
        .querySelector(".printer-actions")
        ?.getBoundingClientRect()
      if (!model || !controls)
        throw new Error("Missing model or controls")
      expect(model.right).toBeLessThanOrEqual(controls.left)
      expect(
        remaining.getBoundingClientRect().bottom,
      ).toBeLessThanOrEqual(controls.top)
      expect(
        getComputedStyle(
          card.querySelector(".printer-head")!,
        ).display,
      ).toBe("none")
    }
  })
})
