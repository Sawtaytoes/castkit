import type { ContractData } from "@castkit/sdk/contracts"
import {
  render,
  screen,
  waitFor,
} from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { inject, test } from "vitest"
import { page } from "vitest/browser"
import { compositionFixture } from "./fixtures.ts"
import { RipDeckView } from "./RipDeckView.tsx"
import "../styles.css"
import "./platform.css"

/** Fixture capture of missing artwork and unmeasured health on a compact rip panel. */
test("rip status without optional metadata", async () => {
  await page.viewport(1024, 600)
  document.documentElement.dataset.scheme = "dark"
  const source = compositionFixture.channels.rips
    ?.data as ContractData["rip-deck.v1"]
  const data = {
    ...source,
    alerts: [],
    bays: [3, 4].map((percent) => ({
      ...source.bays[0]!,
      id: `bay-${percent}`,
      name: `0${percent} - Example Optical Drive`,
      slotNumber: percent,
      title: "Sample film",
      percent,
      phase: "Copying file",
      remainingSeconds: 420,
    })),
  }
  render(
    <main
      class="platform"
      style={{
        padding: "12px",
        inlineSize: "300px",
        blockSize: "300px",
      }}
    >
      <section
        class="platform-panel"
        style={{ flex: 1, padding: "12px" }}
      >
        <h2 class="platform-panel-title">Rip Deck</h2>
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
  const panel = document.querySelector("main")
  if (!panel) throw new Error("Panel was not rendered")
  await page.screenshot({
    element: panel,
    path: `${inject("vrtActualDir")}/platform/rip-deck-priority.png`,
    fullPage: false,
  })
  await userEvent.setup().click(
    screen.getAllByRole("button", {
      name: /Sample film/,
    })[0]!,
  )
  await page.screenshot({
    element: panel,
    path: `${inject("vrtActualDir")}/platform/rip-deck-details.png`,
    fullPage: false,
  })
})
