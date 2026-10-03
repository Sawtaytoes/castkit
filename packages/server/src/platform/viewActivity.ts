import type {
  ChannelSnapshot,
  ContractData,
  ViewDefinition,
  ViewPanel,
} from "@castkit/sdk/contracts"
import {
  DEFAULT_SCAN_SECONDS,
  getCountdownKid,
  getIsScanRecent,
  readScanSeconds,
} from "@castkit/sdk/kidsPointsScan"
import { selectPanelData } from "@castkit/sdk/panelSelection"
import {
  getTemporaryViewSeconds,
  type RepaintGrade,
} from "@castkit/shared/panels/repaint"

/**
 * "Is anything going on" per channel, answered from the contract's own data.
 *
 * A view can ask to show only what is active (`isActiveOnly`): a Working
 * screen's first tab holds the rip deck, the printers and the music side by
 * side, and a region with nothing to report gets out of the way. The answer
 * has to come from the server, because a screen's tabs want it for every view
 * on the screen, and the client only holds the current view's channels.
 *
 * Only contracts with an idle state answer at all. A photo frame, a
 * calendar, a clock or an entity list has nothing to be idle about, and a
 * plugin's own contract is unknown here, so all of those answer `undefined`:
 * an active-only view keeps them on screen (the safe reading), and a tab
 * whose view holds nothing else draws no dot, because "the photos are still
 * there" is not something going on. A channel that is waiting, stale or in
 * error keeps its last data, and that data decides, so a rip in progress
 * does not vanish because the tower missed one poll.
 */
export const isChannelActive = (
  channel: ChannelSnapshot | undefined,
  isRecentlyPaused: IsRecentlyPaused = () => false,
  scanSeconds = DEFAULT_SCAN_SECONDS,
): boolean | undefined => {
  if (!channel) return false
  if (channel.data === null) return false
  switch (channel.type) {
    case "printers.v1":
      return (
        (channel.data as ContractData["printers.v1"])
          .printers.length > 0
      )
    case "rip-deck.v1": {
      const data =
        channel.data as ContractData["rip-deck.v1"]
      return (
        data.isPresent &&
        (data.activeCount > 0 ||
          data.bays.some((bay) => bay.jobId !== undefined))
      )
    }
    case "now-playing.v1": {
      // A paused track stays for ten minutes; see pausedMusic.ts.
      const data =
        channel.data as ContractData["now-playing.v1"]
      return (
        data.isPlaying ||
        (Boolean(data.title || data.artist) &&
          isRecentlyPaused(channel.id))
      )
    }
    case "ai-usage.v1":
      return (
        channel.data as ContractData["ai-usage.v1"]
      ).providers.some((provider) =>
        provider.windows.some(
          (window) => (window.percentUsed ?? 0) > 0,
        ),
      )
    case "kids-points.v1": {
      const data =
        channel.data as ContractData["kids-points.v1"]
      return Boolean(
        scanSeconds > 0 &&
          (getCountdownKid({ data, now: Date.now() }) ||
            (data.lastScan &&
              data.kids.some(
                (kid) => kid.id === data.lastScan?.kidId,
              ) &&
              getIsScanRecent({
                lastScan: data.lastScan,
                scanSeconds,
                now: Date.now(),
              }))),
      )
    }
    case "queue.v1":
      return (
        (channel.data as ContractData["queue.v1"]).items
          .length > 0
      )
    default:
      return undefined
  }
}

/** Whether a now-playing channel stopped less than ten minutes ago. */
export type IsRecentlyPaused = (
  channelId: string,
) => boolean

/** A panel answers as its data binding does; a panel with no data binding has nothing to be idle about. */
export const isPanelActive = ({
  panel,
  channels,
  isRecentlyPaused,
  repaint = "instant",
}: {
  panel: ViewPanel
  channels: Record<string, ChannelSnapshot>
  isRecentlyPaused?: IsRecentlyPaused
  repaint?: RepaintGrade
}): boolean | undefined => {
  const channelId =
    panel.bindings.data ?? Object.values(panel.bindings)[0]
  return channelId === undefined
    ? undefined
    : isChannelActive(
        channels[channelId]
          ? {
              ...channels[channelId],
              data: selectPanelData({
                ...panel,
                data: channels[channelId]?.data,
              }),
            }
          : undefined,
        isRecentlyPaused,
        getTemporaryViewSeconds({
          repaint,
          requestedSeconds: readScanSeconds(panel.settings),
        }) ?? 0,
      )
}

/**
 * Activity keyed by panel id, for the snapshot of one view. A panel with no
 * idle state is left out; the client draws a panel it has no answer for.
 */
export const getPanelActivity = ({
  view,
  channels,
  isRecentlyPaused,
  repaint = "instant",
}: {
  view: ViewDefinition
  channels: Record<string, ChannelSnapshot>
  isRecentlyPaused?: IsRecentlyPaused
  repaint?: RepaintGrade
}): Record<string, boolean> =>
  Object.fromEntries(
    view.panels.flatMap((panel) => {
      const isActive = isPanelActive({
        panel,
        channels,
        isRecentlyPaused,
        repaint,
      })
      return isActive === undefined
        ? []
        : [[panel.id, isActive]]
    }),
  )

/**
 * What a tab's dot reports: `true` when any panel with an idle state is
 * active, `false` when every such panel is idle, `undefined` when the view
 * has no such panel (a photo frame, an agenda), so the tab draws no dot.
 */
export const isViewActive = ({
  view,
  channels,
  isRecentlyPaused,
  repaint = "instant",
}: {
  view: ViewDefinition
  channels: Record<string, ChannelSnapshot>
  isRecentlyPaused?: IsRecentlyPaused
  repaint?: RepaintGrade
}): boolean | undefined => {
  const answers = view.panels
    .map((panel) =>
      isPanelActive({
        panel,
        channels,
        isRecentlyPaused,
        repaint,
      }),
    )
    .filter((isActive) => isActive !== undefined)
  return answers.length === 0
    ? undefined
    : answers.some((isActive) => isActive)
}
