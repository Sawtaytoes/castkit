import { isVisible } from "@castkit/sdk/conditions"
import type {
  ChannelSnapshot,
  ViewPanel,
} from "@castkit/sdk/contracts"

const object = (value: unknown): Record<string, unknown> =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
const parse = (value: unknown): unknown => {
  if (typeof value !== "string") return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}
/** Recheck the same view conditions on the server before sending any control upstream. */
export const assertActionAllowed = ({
  panel,
  channels,
  channelId,
  action,
  payload,
}: {
  panel: ViewPanel
  channels: Record<string, ChannelSnapshot>
  channelId: string
  action: string
  payload: Record<string, unknown>
}) => {
  // A malformed policy must never turn a configured restriction into no restriction.
  ;[
    ["entityVisibility", "entityVisibilityJson", false],
    ["actionVisibility", "actionVisibilityJson", false],
    ["actionButtons", "actionButtonsJson", true],
  ].forEach(([key, jsonKey, isArray]) => {
    const configured =
      panel.settings[String(key)] ??
      panel.settings[String(jsonKey)]
    if (configured === undefined || configured === "")
      return
    const value = parse(configured)
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) !== isArray
    )
      throw new Error(
        "The panel has an invalid control policy",
      )
    if (
      key === "actionVisibility" &&
      Object.values(value).some(
        (entry) =>
          !entry ||
          typeof entry !== "object" ||
          Array.isArray(entry),
      )
    )
      throw new Error(
        "The panel has an invalid action policy",
      )
  })
  const allEntities = Object.values(channels).flatMap(
    (channel) =>
      channel.type === "entities.v1" &&
      channel.status === "ready" &&
      Array.isArray(object(channel.data).entities)
        ? (object(channel.data).entities as {
            id: string
            state: string
            actions?: string[]
          }[])
        : [],
  )
  if (
    !isVisible({
      condition:
        panel.settings.visibleWhen ??
        panel.settings.visibleWhenJson,
      entities: allEntities,
    })
  )
    throw new Error(
      "The panel's control conditions are not met",
    )
  const channel = channels[channelId]
  const data = object(channel?.data)
  if (channel?.type === "entities.v1") {
    const entities = Array.isArray(data.entities)
      ? (data.entities as {
          id: string
          state: string
          actions?: string[]
        }[])
      : []
    const entityId = payload.entityId
    const entity = entities.find(
      (item) => item.id === entityId,
    )
    if (!entity?.actions?.includes(action))
      throw new Error(
        "This entity action is not available in the selected channel",
      )
    if (
      !isVisible({
        condition: object(
          parse(
            panel.settings.entityVisibility ??
              panel.settings.entityVisibilityJson,
          ),
        )[entity.id],
        entities: allEntities,
      })
    )
      throw new Error(
        "The entity's control conditions are not met",
      )
    if (
      !isVisible({
        condition: object(
          object(
            parse(
              panel.settings.actionVisibility ??
                panel.settings.actionVisibilityJson,
            ),
          )[entity.id],
        )[action],
        entities: allEntities,
      })
    )
      throw new Error("The action conditions are not met")
    const buttons = parse(
      panel.settings.actionButtons ??
        panel.settings.actionButtonsJson,
    )
    const matching = Array.isArray(buttons)
      ? buttons
          .map(object)
          .filter(
            (button) =>
              button.entityId === entityId &&
              button.action === action,
          )
      : []
    const configuredEntities = panel.settings.entityIds
    if (
      Array.isArray(configuredEntities) &&
      !configuredEntities.includes(entityId) &&
      !matching.length
    )
      throw new Error(
        "The entity is not displayed by this panel",
      )
    if (
      matching.length &&
      !matching.some(
        (button) =>
          isVisible({
            condition: button.visibleWhen,
            entities: allEntities,
          }) &&
          Object.entries(object(button.payload)).every(
            ([key, value]) =>
              JSON.stringify(payload[key]) ===
              JSON.stringify(value),
          ),
      )
    )
      throw new Error(
        "The control's conditions or configured parameters are not met",
      )
  }
  if (
    channel?.type === "printers.v1" &&
    (typeof payload.printerId !== "string" ||
      !payload.printerId)
  )
    throw new Error("Select a printer for this action")
  if (
    channel?.type === "rip-deck.v1" &&
    !["open_trays", "close_trays"].includes(action) &&
    (typeof payload.driveId !== "string" ||
      !payload.driveId)
  )
    throw new Error("Select a drive for this action")
  if (
    channel?.type === "printers.v1" &&
    payload.printerId !== undefined &&
    (!Array.isArray(data.printers) ||
      !data.printers.some(
        (printer) =>
          object(printer).id === payload.printerId,
      ))
  )
    throw new Error(
      "The printer is not part of this channel",
    )
  if (
    channel?.type === "rip-deck.v1" &&
    payload.driveId !== undefined &&
    (!Array.isArray(data.bays) ||
      !data.bays.some(
        (bay) => object(bay).id === payload.driveId,
      ))
  )
    throw new Error("The drive is not part of this channel")
}
