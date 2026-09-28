import type {
  ChannelSnapshot,
  ContractData,
  ViewDefinition,
  ViewPanel,
} from "@castkit/sdk/contracts"

/**
 * "Is anything going on" per channel, answered from the contract's own data.
 *
 * A view can ask to show only what is active (`isActiveOnly`): a Working
 * screen's first tab holds the rip deck, the printers and the music side by
 * side, and a region with nothing to report gets out of the way. The answer
 * has to come from the server, because a screen's tabs want it for every view
 * on the screen, and the client only holds the current view's channels.
 *
 * Only contracts with an idle state answer `false`. A photo frame, a
 * calendar, a clock or an entity list has nothing to be idle about, and a
 * plugin's own contract is unknown here, so all of those are active: putting
 * one in an active-only view keeps it on screen, which is the safe reading.
 * A channel that is waiting, stale or in error keeps its last data, and that
 * data decides, so a rip in progress does not vanish because the tower missed
 * one poll.
 */
export const isChannelActive = (
  channel: ChannelSnapshot | undefined,
) => {
  if (!channel || channel.data === null) return false
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
    case "now-playing.v1":
      return (
        channel.data as ContractData["now-playing.v1"]
      ).isPlaying
    case "queue.v1":
      return (
        (channel.data as ContractData["queue.v1"]).items
          .length > 0
      )
    default:
      return true
  }
}

/** A panel is active when its data binding is; a panel with no data binding has nothing to be idle about. */
export const isPanelActive = ({
  panel,
  channels,
}: {
  panel: ViewPanel
  channels: Record<string, ChannelSnapshot>
}) => {
  const channelId =
    panel.bindings.data ?? Object.values(panel.bindings)[0]
  return channelId === undefined
    ? true
    : isChannelActive(channels[channelId])
}

/** Activity keyed by panel id, for the snapshot of one view. */
export const getPanelActivity = ({
  view,
  channels,
}: {
  view: ViewDefinition
  channels: Record<string, ChannelSnapshot>
}): Record<string, boolean> =>
  Object.fromEntries(
    view.panels.map((panel) => [
      panel.id,
      isPanelActive({ panel, channels }),
    ]),
  )

/** A view is active when any of its panels is, which is what a tab's dot reports. */
export const isViewActive = ({
  view,
  channels,
}: {
  view: ViewDefinition
  channels: Record<string, ChannelSnapshot>
}) =>
  view.panels.some((panel) =>
    isPanelActive({ panel, channels }),
  )
