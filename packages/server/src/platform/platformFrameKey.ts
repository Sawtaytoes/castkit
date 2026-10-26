import { getUpcomingAgendaEvents } from "@castkit/sdk/agendaWindow"
import type {
  ChannelSnapshot,
  ContractData,
  ViewPanel,
} from "@castkit/sdk/contracts"
import {
  getIsScanRecent,
  getRunningKids,
  readScanSeconds,
} from "@castkit/sdk/kidsPointsScan"
import {
  getTemporaryViewSeconds,
  type RepaintGrade,
} from "@castkit/shared/panels/repaint"
import type { Platform } from "./platform.ts"

type PanelTimeState =
  | { isTimeDriven: true }
  | { isTimeDriven: false; state?: unknown }

const TIME_DRIVEN: PanelTimeState = { isTimeDriven: true }

/*
 * The short landscape panel draws a calendar as a clock face. Same test as
 * slatecast's `SHORT_PANEL_QUERY`, taken in either orientation so a rotated
 * installation cannot slip past it.
 */
const getIsShortPanel = ({
  width,
  height,
}: {
  width: number
  height: number
}) =>
  Math.max(width, height) / Math.min(width, height) >=
    5 / 4 && Math.min(width, height) <= 400

const readPanelData = <Type>({
  panel,
  channels,
}: {
  panel: ViewPanel
  channels: Record<string, ChannelSnapshot>
}) => {
  const channelId = panel.bindings.data
  return (
    channelId ? channels[channelId]?.data : undefined
  ) as Type | null | undefined
}

/**
 * How time alone changes one panel of a captured frame. A panel is either
 * time-driven (it shows a running clock or timer, so a frame drawn earlier is
 * already wrong) or settled, with the few discrete facts `now` decides.
 *
 * Only panels whose time behavior is written down here can be prepared ahead.
 * Every other spec counts as time-driven, so a display that shows one keeps
 * rendering on its request exactly as it did before frames were kept.
 */
const getPanelTimeState = ({
  panel,
  channels,
  display,
  now,
}: {
  panel: ViewPanel
  channels: Record<string, ChannelSnapshot>
  display: {
    width: number
    height: number
    repaint: RepaintGrade
  }
  now: number
}): PanelTimeState => {
  if (panel.specId === "kids-points") {
    // The totals list draws names and today's points only: no timer, no
    // scan banner. It is checked after the compact summary in the view.
    if (
      panel.settings.isTotalsOnly === true &&
      panel.settings.isCompactSummary !== true
    ) {
      return { isTimeDriven: false }
    }
    const data = readPanelData<
      ContractData["kids-points.v1"]
    >({ panel, channels })
    if (!data) {
      return { isTimeDriven: false }
    }
    const scanSeconds = getTemporaryViewSeconds({
      repaint: display.repaint,
      requestedSeconds: readScanSeconds(panel.settings),
    })
    const isScanShowing =
      scanSeconds !== undefined &&
      getIsScanRecent({
        lastScan: data.lastScan,
        scanSeconds,
        now,
      })
    // A running timer counts minutes and a scan banner expires on its own.
    return isScanShowing ||
      getRunningKids({ data, now }).length > 0
      ? TIME_DRIVEN
      : { isTimeDriven: false }
  }
  if (
    panel.specId === "calendar" ||
    panel.specId === "agenda"
  ) {
    if (getIsShortPanel(display)) {
      return TIME_DRIVEN
    }
    const data = readPanelData<ContractData["agenda.v1"]>({
      panel,
      channels,
    })
    // The filter only ever drops events as time passes, so the count names
    // the visible subset of a given payload.
    return {
      isTimeDriven: false,
      state: data
        ? getUpcomingAgendaEvents({
            events: data.events,
            now,
          }).length
        : undefined,
    }
  }
  return TIME_DRIVEN
}

/**
 * Everything a display's platform target draws from, as one string, and
 * whether time alone also changes it (a running clock or timer at `now`).
 * `undefined` when the target or the display is unknown.
 *
 * ⚠️ The content names no device; see `readPlatformFrameKey`.
 */
export const readPlatformTargetContent = ({
  platform,
  deviceId,
  deviceTarget,
  now,
}: {
  platform: Pick<
    Platform,
    "getTarget" | "getDeviceProperties" | "channelsForView"
  >
  deviceId: string
  deviceTarget: { kind: "view" | "screen"; id: string }
  now: number
}) => {
  const target = platform.getTarget(deviceTarget)
  const display = platform.getDeviceProperties(deviceId)
  if (!target || !display) {
    return undefined
  }
  const channels = platform.channelsForView(target.view)
  const panelStates = target.view.panels.map((panel) =>
    getPanelTimeState({ panel, channels, display, now }),
  )
  return {
    content: JSON.stringify({
      target: deviceTarget,
      screen: target.screen,
      view: target.view,
      display,
      channels: Object.values(channels).map((channel) => ({
        id: channel.id,
        status: channel.status,
        data: channel.data,
      })),
      panelStates,
    }),
    channelIds: Object.values(channels).map(
      (channel) => channel.id,
    ),
    isTimeDriven:
      Object.values(channels).some(
        (channel) => channel.type === "time.v1",
      ) || panelStates.some((panel) => panel.isTimeDriven),
  }
}

/**
 * Everything an image display's platform frame is drawn from, as one string,
 * or `undefined` when no frame can be kept for it: the display shows its own
 * views, or its platform view is time-driven at `now`.
 *
 * ⚠️ The key names no device. Two displays with the same panel properties on
 * the same target, view and channel data get the same picture, so they share
 * one capture. That holds because nothing a capture draws is scoped to the
 * device: the capture URL's `?device=` only selects the display properties
 * (already in the key) and passes the assignment check, the page's device
 * socket refuses an image display, and every channel a view reads is named in
 * the view itself. A view that ever resolves content BY device must put the
 * device ID into this key, or one room's data reaches another room's panel.
 */
export const readPlatformFrameKey = ({
  platform,
  deviceId,
  now,
}: {
  platform: Pick<
    Platform,
    | "getDeviceTarget"
    | "getTarget"
    | "getDeviceProperties"
    | "channelsForView"
  >
  deviceId: string
  now: number
}) => {
  const deviceTarget = platform.getDeviceTarget(deviceId)
  if (!deviceTarget) {
    return undefined
  }
  const content = readPlatformTargetContent({
    platform,
    deviceId,
    deviceTarget,
    now,
  })
  return content && !content.isTimeDriven
    ? content.content
    : undefined
}
