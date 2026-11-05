import { render } from "@testing-library/preact"
import {
  afterAll,
  afterEach,
  beforeAll,
  inject,
  test,
  vi,
} from "vitest"
import { page } from "vitest/browser"
import { nowMs } from "../state.ts"
import { SCREENSHOT_EPOCH_MILLIS } from "../stories/freezeClockUnderAutomation.ts"
import { sixAccountDeskSnapshot } from "./__fixtures__/sixAccountDesk.ts"
import {
  type DisplayProperties,
  DisplayPropertiesContext,
} from "./displayProperties.ts"
import { sixAccountUsageFixture } from "./fixtures.ts"
import { DisplayComposition } from "./PlatformApp.tsx"
import type { DisplaySnapshot } from "./protocol.ts"
import "../styles.css"
import "./platform.css"

/**
 * Visual-regression shots of AI Usage carrying six subscriptions: three
 * Claude accounts, two Codex accounts, and SpaceXAI.
 *
 * The desk shots reproduce the adaptive activity composition at 1024 x 600,
 * idle and while a printer runs, at the browser's own size and zoomed. The
 * panel shots are the geometries the AI Usage documentation names, and the
 * window shots are the four browser test windows. Run by `pnpm vrt:capture`
 * only; the file names are the baseline keys.
 */

const shotPath = (name: string) =>
  `${inject("vrtActualDir")}/platform/ai-usage-six-accounts-${name}.png`

const capture = async (name: string) => {
  await document.fonts.ready
  // Two frames: the view measures its panel, then lays out at that size.
  await new Promise((onFrame) =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => onFrame(undefined)),
    ),
  )
  await page.screenshot({
    path: shotPath(name),
    element: document.body,
  })
}

const renderPage = ({
  snapshot,
  properties,
  width,
  height,
  zoom = 1,
}: {
  snapshot: DisplaySnapshot
  properties: DisplayProperties
  width: number
  height: number
  zoom?: number
}) => {
  document.documentElement.dataset.scheme =
    snapshot.view.theme
  return render(
    <DisplayPropertiesContext.Provider
      value={{ ...properties, width, height }}
    >
      <main
        class="platform"
        data-device="true"
        data-scheme={snapshot.view.theme}
        style={{
          zoom,
          width: `${width / zoom}px`,
          height: `${height / zoom}px`,
        }}
      >
        <DisplayComposition
          snapshot={snapshot}
          isConnected
          onAction={async () => undefined}
        />
      </main>
    </DisplayPropertiesContext.Provider>,
  )
}

const BROWSER_PROPERTIES: DisplayProperties = {
  delivery: "browser",
  repaint: "instant",
}

beforeAll(() => {
  vi.useFakeTimers({
    now: SCREENSHOT_EPOCH_MILLIS,
    toFake: ["Date"],
  })
  nowMs.value = SCREENSHOT_EPOCH_MILLIS
})

afterAll(() => {
  vi.useRealTimers()
})

afterEach(() => page.viewport(414, 896))

test.each([
  { state: "idle", isPrinting: false, zoom: 1 },
  { state: "idle", isPrinting: false, zoom: 1.5 },
  { state: "printing", isPrinting: true, zoom: 1 },
  { state: "printing", isPrinting: true, zoom: 1.5 },
])("the 1024 x 600 desk composition, $state, at $zoom x zoom", async ({
  state,
  isPrinting,
  zoom,
}) => {
  await page.viewport(1024, 600)
  renderPage({
    snapshot: sixAccountDeskSnapshot({
      nowMs: SCREENSHOT_EPOCH_MILLIS,
      isPrinting,
    }),
    properties: BROWSER_PROPERTIES,
    width: 1024,
    height: 600,
    zoom,
  })
  await capture(`desk-${state}-1024x600-zoom-${zoom}`)
})

test.each([
  {
    name: "impression-800x480",
    width: 800,
    height: 480,
    properties: {
      delivery: "image",
      repaint: "super-slow",
      hasTouch: false,
    },
  },
  {
    name: "m5paper-960x540",
    width: 960,
    height: 540,
    properties: {
      delivery: "image",
      repaint: "fast",
      hasTouch: true,
      colorMode: "monochrome",
    },
  },
  {
    name: "square-720x720",
    width: 720,
    height: 720,
    properties: BROWSER_PROPERTIES,
  },
  {
    name: "letterbox-1360x480",
    width: 1360,
    height: 480,
    properties: {
      delivery: "image",
      repaint: "slow",
      hasTouch: false,
      colorMode: "monochrome",
    },
  },
  {
    name: "phat-250x122",
    width: 250,
    height: 122,
    properties: {
      delivery: "image",
      repaint: "fast",
      hasTouch: false,
      colorMode: "monochrome",
    },
  },
  {
    name: "narrow-384x824",
    width: 384,
    height: 824,
    properties: BROWSER_PROPERTIES,
  },
  {
    name: "tall-1080x1920",
    width: 1080,
    height: 1920,
    properties: BROWSER_PROPERTIES,
  },
  {
    name: "wide-1920x1080",
    width: 1920,
    height: 1080,
    properties: BROWSER_PROPERTIES,
  },
  {
    name: "ultrawide-3440x1440",
    width: 3440,
    height: 1440,
    properties: BROWSER_PROPERTIES,
  },
] satisfies {
  name: string
  width: number
  height: number
  properties: DisplayProperties
}[])("the AI Usage view alone on $name", async ({
  name,
  width,
  height,
  properties,
}) => {
  await page.viewport(width, height)
  renderPage({
    snapshot: sixAccountUsageFixture({
      nowMs: SCREENSHOT_EPOCH_MILLIS,
    }),
    properties,
    width,
    height,
  })
  await capture(`view-${name}`)
})
