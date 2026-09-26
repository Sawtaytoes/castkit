import { render, screen } from "@testing-library/preact"
import { afterEach, expect, test } from "vitest"
import { page } from "vitest/browser"
import { DisplayComposition } from "./PlatformApp.tsx"
import type { DisplaySnapshot } from "./protocol.ts"
// The short-panel layouts are media queries, so the real rules must load.
import "../styles.css"
import "./platform.css"

// A display moved onto a platform screen drew the generic centered clock and
// lost its weather, because the platform views did not reuse the faces chosen
// for the 480x320 panel on 2026-09-11. These pin that the platform draws them.

const SHORT_PANEL = { width: 480, height: 320 }

const weatherChannel = {
  id: "tower/weather",
  type: "weather.v1",
  status: "ready" as const,
  updatedAt: "2026-01-01T12:00:00Z",
  data: {
    temperatureText: "63°",
    conditionText: "Partly cloudy",
    condition: "partlycloudy",
  },
}

const agendaChannel = {
  id: "tower/agenda",
  type: "agenda.v1",
  status: "ready" as const,
  updatedAt: "2026-01-01T12:00:00Z",
  data: {
    events: [
      {
        startMs: Date.now() + 3_600_000,
        summary: "Swimming lessons",
        isAllDay: false,
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

const renderOnShortPanel = async (
  snapshot: DisplaySnapshot,
) => {
  await page.viewport(SHORT_PANEL.width, SHORT_PANEL.height)
  render(
    <DisplayComposition
      snapshot={snapshot}
      isConnected
      onAction={async () => undefined}
    />,
  )
}

afterEach(() => page.viewport(414, 896))

test("the ambient panel draws the short-panel face with its bound weather", async () => {
  await renderOnShortPanel(
    snapshotFor({
      specId: "ambient",
      bindings: { weather: weatherChannel.id },
    }),
  )
  expect(
    document.querySelector(".ambient-short"),
  ).not.toBeNull()
  expect(
    document.querySelector(".platform-clock"),
  ).toBeNull()
  expect(screen.getByText("63°")).toBeVisible()
  expect(screen.getByText("Partly cloudy")).toBeVisible()
})

test("the clock panel draws the date tile beside the time", async () => {
  await renderOnShortPanel(
    snapshotFor({ specId: "clock", bindings: {} }),
  )
  expect(
    document.querySelector(".date-tile"),
  ).not.toBeNull()
  expect(
    document.querySelector(".clock-short-time"),
  ).not.toBeNull()
})

test("the calendar panel draws the one-row header with weather over the agenda", async () => {
  await renderOnShortPanel(
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
  expect(screen.getByText("Swimming lessons")).toBeVisible()
  expect(screen.getByText("63°")).toBeVisible()
})
