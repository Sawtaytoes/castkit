import { render } from "@testing-library/preact"
import { afterEach, expect, inject, test } from "vitest"
import { page } from "vitest/browser"
import { compositionFixture } from "./fixtures.ts"
import { DisplayComposition } from "./PlatformApp.tsx"
import { ViewTabs } from "./ViewTabs.tsx"
import "../styles.css"
import "./platform.css"

/**
 * Visual-regression shot of a browser screen's header with its views as tabs
 * (`ViewTabs`), above the composition fixture. Written by `yarn vrt:capture`
 * like `ShortPanel.vrt.tsx`; the file name is the baseline key.
 */
const shotPath = (name: string) =>
  `${inject("vrtActualDir")}/platform/${name}.png`

const VIEWS = [
  { id: "activity", name: "Activity", isActive: true },
  { id: "printers", name: "3D Printers", isActive: true },
  { id: "rip-deck", name: "Rip Deck" },
  { id: "agenda-photos", name: "Agenda and Photos" },
  { id: "photos", name: "Photos" },
  { id: "now-playing", name: "Now Playing" },
]

afterEach(() => page.viewport(414, 896))

test("a screen's views are tabs across its header", async () => {
  await page.viewport(1280, 480)
  document.documentElement.dataset.scheme = "dark"
  render(
    <main
      class="platform"
      data-device="false"
      data-screen-navigation="true"
      data-scheme="dark"
    >
      <header class="platform-header">
        <h1>{compositionFixture.view.name}</h1>
        <div>
          <ViewTabs views={VIEWS} activeId="activity" />
          <button type="button">Lock</button>
        </div>
      </header>
      <DisplayComposition
        snapshot={compositionFixture}
        isConnected
        onAction={async () => undefined}
      />
    </main>,
  )
  expect(
    document.querySelector(
      '.platform-view-tabs a[aria-current="page"]',
    )?.textContent,
  ).toBe("Activity")
  await document.fonts.ready
  await new Promise((onFrame) =>
    requestAnimationFrame(() => onFrame(undefined)),
  )
  await page.screenshot({
    path: shotPath("screen-tabs-1280x480"),
    element: document.body,
  })
})

test("an active-only view with nothing active says so in one line", async () => {
  await page.viewport(1280, 480)
  document.documentElement.dataset.scheme = "dark"
  render(
    <main
      class="platform"
      data-device="false"
      data-screen-navigation="true"
      data-scheme="dark"
    >
      <header class="platform-header">
        <h1>Now</h1>
        <div>
          <ViewTabs
            views={VIEWS.map((view) => ({
              ...view,
              isActive: false,
            }))}
            activeId="activity"
          />
          <button type="button">Lock</button>
        </div>
      </header>
      <DisplayComposition
        snapshot={{
          ...compositionFixture,
          view: {
            ...compositionFixture.view,
            name: "Now",
            isActiveOnly: true,
          },
          panelActivity: { printers: false, discs: false },
        }}
        isConnected
        onAction={async () => undefined}
      />
    </main>,
  )
  expect(
    document.querySelector(".platform-nothing-active p")
      ?.textContent,
  ).toBe("Nothing active")
  await document.fonts.ready
  await new Promise((onFrame) =>
    requestAnimationFrame(() => onFrame(undefined)),
  )
  await page.screenshot({
    path: shotPath("screen-nothing-active-1280x480"),
    element: document.body,
  })
})
