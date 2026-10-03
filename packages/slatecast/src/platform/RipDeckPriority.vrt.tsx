import type { ContractData } from "@castkit/sdk/contracts"
import { render, waitFor } from "@testing-library/preact"
import { inject, test } from "vitest"
import { page } from "vitest/browser"
import { compositionFixture } from "./fixtures.ts"
import { RipDeckView } from "./RipDeckView.tsx"
import "../styles.css"
import "./platform.css"

/** Fixture capture of missing artwork and unmeasured health on a compact rip panel. */
test("rip status without optional metadata", async () => {
  await page.viewport(480, 300)
  document.documentElement.dataset.scheme = "dark"
  const source = compositionFixture.channels.rips
    ?.data as ContractData["rip-deck.v1"]
  const data = {
    ...source,
    alerts: [],
    bays: [3, 4].map((percent) => ({
      ...source.bays[0]!,
      id: `bay-${percent}`,
      name: `Bay ${percent}`,
      title: "Sample film",
      percent,
      phase: "Reading disc",
    })),
  }
  render(
    <main class="platform" style={{ padding: "12px" }}>
      <section
        class="platform-panel"
        style={{ flex: 1, padding: "12px" }}
      >
        <RipDeckView
          data={data}
          settings={{ presentation: "posters" }}
          isControlEnabled
          onAction={async () => undefined}
        />
      </section>
    </main>,
  )
  await document.fonts.ready
  await waitFor(() => {
    if (
      !document.querySelector(
        ".platform-rips[data-presentation]",
      )
    )
      throw new Error("Layout not measured")
  })
  await new Promise((resolve) => setTimeout(resolve, 500))
  await page.screenshot({
    path: `${inject("vrtActualDir")}/platform/rip-deck-priority.png`,
    fullPage: false,
  })
})
