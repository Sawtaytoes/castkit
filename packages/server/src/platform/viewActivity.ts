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
      return undefined
  }
}

/** A panel answers as its data binding does; a panel with no data binding has nothing to be idle about. */
export const isPanelActive = ({
  panel,
  channels,
}: {
  panel: ViewPanel
  channels: Record<string, ChannelSnapshot>
}): boolean | undefined => {
  const channelId =
    panel.bindings.data ?? Object.values(panel.bindings)[0]
  return channelId === undefined
    ? undefined
    : isChannelActive(channels[channelId])
}

/**
 * Activity keyed by panel id, for the snapshot of one view. A panel with no
 * idle state is left out; the client draws a panel it has no answer for.
 */
export const getPanelActivity = ({
  view,
  channels,
}: {
  view: ViewDefinition
  channels: Record<string, ChannelSnapshot>
}): Record<string, boolean> =>
  Object.fromEntries(
    view.panels.flatMap((panel) => {
      const isActive = isPanelActive({ panel, channels })
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
}: {
  view: ViewDefinition
  channels: Record<string, ChannelSnapshot>
}): boolean | undefined => {
  const answers = view.panels
    .map((panel) => isPanelActive({ panel, channels }))
    .filter((answer) => answer !== undefined)
  return answers.length === 0
    ? undefined
    : answers.some((answer) => answer)
}
