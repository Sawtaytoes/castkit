import { render } from "@testing-library/preact"
import {
  afterAll,
  afterEach,
  beforeAll,
  expect,
  inject,
  test,
  vi,
} from "vitest"
import { page } from "vitest/browser"
import {
  buildDeviceProfile,
  buildSettings,
  buildSnapshot,
  buildWeather,
} from "../__fixtures__/buildSnapshot.ts"
import { mountSlatecast } from "../__tests__/setup/mountSlatecast.tsx"
import { nowMs } from "../state.ts"
import { SCREENSHOT_EPOCH_MILLIS } from "../stories/freezeClockUnderAutomation.ts"
import { DisplayComposition } from "./PlatformApp.tsx"
import type { DisplaySnapshot } from "./protocol.ts"
import "../styles.css"
import "./platform.css"

/**
 * Visual-regression shots of the faces on the real 480x320 short panel.
 *
 * Storybook does not stage the platform renderer at this size, and the
 * platform is what a physical display loads. On 2026-09-25 a rebuilt renderer
 * changed the Rip Deck panel's clock, date and weather text and every unit
 * test still passed, because they pin the DOM and not the picture. These
 * write the picture; `ShortPanelClockFaces.test.tsx` and
 * `AmbientShortPanel.test.tsx` keep the assertions.
 *
 * Run by `yarn vrt:capture` only (see `vitest.vrt.config.ts`). The clock,
 * the weather and the agenda are fixed, so a shot changes only when the
 * rendering does. The file names are the baseline keys: renaming one is a
 * deleted shot plus a new one.
 */

const SHORT_PANEL = { width: 480, height: 320 }

const shotPath = (name: string) =>
  `${inject("vrtActualDir")}/platform/${name}.png`

const weatherChannel = {
  id: "tower/weather",
  type: "weather.v1",
  status: "ready" as const,
  updatedAt: "2025-07-02T18:00:00Z",
  data: {
    temperatureText: "72°",
    conditionText: "Partly cloudy",
    condition: "partlycloudy",
  },
}

const HOUR_MILLIS = 3_600_000

const agendaChannel = {
  id: "tower/agenda",
  type: "agenda.v1",
  status: "ready" as const,
  updatedAt: "2025-07-02T18:00:00Z",
  data: {
    events: [
      {
        startMs: SCREENSHOT_EPOCH_MILLIS + HOUR_MILLIS,
        summary: "Swimming lessons",
        isAllDay: false,
      },
      {
        startMs: SCREENSHOT_EPOCH_MILLIS + 3 * HOUR_MILLIS,
        summary: "Book club",
        isAllDay: false,
      },
      {
        startMs: SCREENSHOT_EPOCH_MILLIS + 26 * HOUR_MILLIS,
        summary: "Library returns due",
        isAllDay: true,
      },
    ],
  },
}

const snapshotFor = ({
  specId,
  bindings,
}: {
  specId: string
  bindings: Record<string, string>
}): DisplaySnapshot => ({
  target: { kind: "screen", id: "tower" },
  canControl: false,
  view: {
    id: `kiosk-${specId}`,
    name: specId,
    layout: "single",
    theme: "dark",
    access: "public",
    isControlEnabled: false,
    panels: [
      { id: specId, specId, bindings, settings: {} },
    ],
  },
  channels: {
    [weatherChannel.id]: weatherChannel,
    [agendaChannel.id]: agendaChannel,
  },
})

/**
 * A physical display's page: the platform root, edge to edge, with the view's
 * scheme stamped on `<html>` and on the root the way `PlatformApp` stamps it.
 */
const renderDevicePage = (snapshot: DisplaySnapshot) => {
  document.documentElement.dataset.scheme =
    snapshot.view.theme
  return render(
    <main
      class="platform"
      data-device="true"
      data-scheme={snapshot.view.theme}
    >
      <DisplayComposition
        snapshot={snapshot}
        isConnected
        onAction={async () => undefined}
      />
    </main>,
  )
}

const capture = async (name: string) => {
  await document.fonts.ready
  // One frame for the fonts' second layout to paint.
  await new Promise((onFrame) =>
    requestAnimationFrame(() => onFrame(undefined)),
  )
  await page.screenshot({
    path: shotPath(name),
    element: document.body,
  })
}

beforeAll(() => {
  vi.useFakeTimers({
    now: SCREENSHOT_EPOCH_MILLIS,
    toFake: ["Date"],
  })
  // `state.ts` read the real clock when it loaded, before the fake one
  // existed, and only its one-second tick would correct it.
  nowMs.value = SCREENSHOT_EPOCH_MILLIS
})

afterAll(() => {
  vi.useRealTimers()
})

afterEach(() => page.viewport(414, 896))

test("the platform ambient face on the short panel", async () => {
  await page.viewport(SHORT_PANEL.width, SHORT_PANEL.height)
  renderDevicePage(
    snapshotFor({
      specId: "ambient",
      bindings: { weather: weatherChannel.id },
    }),
  )
  expect(
    document.querySelector(".ambient-short"),
  ).not.toBeNull()
  await capture("ambient-480x320")
})

test("the platform clock face on the short panel", async () => {
  await page.viewport(SHORT_PANEL.width, SHORT_PANEL.height)
  renderDevicePage(
    snapshotFor({ specId: "clock", bindings: {} }),
  )
  expect(
    document.querySelector(".clock-short-time"),
  ).not.toBeNull()
  await capture("clock-480x320")
})

test("the platform calendar face on the short panel", async () => {
  await page.viewport(SHORT_PANEL.width, SHORT_PANEL.height)
  renderDevicePage(
    snapshotFor({
      specId: "calendar",
      bindings: {
        data: agendaChannel.id,
        weather: weatherChannel.id,
      },
    }),
  )
  expect(
    document.querySelector(".calendar-short"),
  ).not.toBeNull()
  await capture("calendar-480x320")
})

test("the device-page ambient view on the short panel", async () => {
  await page.viewport(SHORT_PANEL.width, SHORT_PANEL.height)
  await mountSlatecast({
    snapshot: buildSnapshot({
      view: "ambient",
      device: buildDeviceProfile(SHORT_PANEL),
      settings: buildSettings({
        clock: {
          timeZone: "America/Chicago",
          isTwelveHour: true,
          isNumericDate: false,
        },
      }),
      data: {
        weather: buildWeather({
          temperatureText: "72°",
          conditionText: "Partly cloudy",
          condition: "partlycloudy",
        }),
      },
    }),
  })
  expect(
    document.querySelector(
      ".ambient-weather .weather-mark",
    ),
  ).not.toBeNull()
  await capture("device-page-ambient-480x320")
})
