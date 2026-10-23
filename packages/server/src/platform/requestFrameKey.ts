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
 * Everything a `renderOn: "request"` display's platform frame is drawn from,
 * as one string, or `undefined` when no frame can be kept for it: the display
 * shows its own views, or its platform view is time-driven at `now`.
 *
 * Two frames with the same key are the same picture, so a frame rendered
 * ahead answers a request whose key matches.
 */
export const readRequestFrameKey = ({
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
  const target = deviceTarget
    ? platform.getTarget(deviceTarget)
    : null
  const display = platform.getDeviceProperties(deviceId)
  if (!deviceTarget || !target || !display) {
    return undefined
  }
  const channels = platform.channelsForView(target.view)
  if (
    Object.values(channels).some(
      (channel) => channel.type === "time.v1",
    )
  ) {
    return undefined
  }
  const panelStates = target.view.panels.map((panel) =>
    getPanelTimeState({ panel, channels, display, now }),
  )
  if (panelStates.some((panel) => panel.isTimeDriven)) {
    return undefined
  }
  return JSON.stringify({
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
  })
}
