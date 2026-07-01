import type { DeviceMetadata } from "@inkcast/core/devices/device"
import { ClockView } from "@inkcast/views/ClockView"
import { NowPlayingCard } from "@inkcast/views/NowPlayingCard"
import { createElement, type ReactElement } from "react"

/**
 * The views a device can show, and how to turn a view name + device into a
 * React element to render. This is the seam Phase 2 plugs real data adapters
 * into (HA media player, Immich, weather); for now the now-playing view uses
 * placeholder data and the clock uses the server clock.
 */

export const VIEW_NAMES = ["now-playing", "clock"] as const
export type ViewName = (typeof VIEW_NAMES)[number]

export const getIsViewName = (
  value: string,
): value is ViewName =>
  (VIEW_NAMES as readonly string[]).includes(value)

const formatTime = (now: Date) =>
  new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(now)

const formatDate = (now: Date) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(now)

/** Build the React element for a device's active view at a given instant. */
export const renderViewElement = ({
  viewName,
  device,
  now,
}: {
  viewName: ViewName
  device: DeviceMetadata
  now: Date
}): ReactElement => {
  const panel = {
    width: device.width,
    height: device.height,
    colourMode: device.colourMode,
  }

  if (viewName === "clock") {
    return createElement(ClockView, {
      ...panel,
      time: formatTime(now),
      date: formatDate(now),
    })
  }

  // Placeholder until the Phase-2 HA data adapter feeds real now-playing data.
  return createElement(NowPlayingCard, {
    ...panel,
    artist: "—",
    title: "Nothing playing",
    isPlaying: false,
  })
}
