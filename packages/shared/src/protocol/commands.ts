import * as z from "zod/mini"

/**
 * The device→house command contract. A browser-mode device's taps (or, later,
 * an image-mode touch device's mapped tap regions) become ONE JSON message on
 * `<base>/<id>/command` (QoS 1, NOT retained). A single HA automation triggers
 * on the topic and dispatches on `payload_json.action` — the device→player
 * mapping lives entirely in HA. See
 * docs/decisions/2026-07-07-slatecast-pure-mqtt-command-path.md.
 */

export const DEVICE_COMMAND_ACTIONS = [
  "play_pause",
  "next",
  "previous",
  "seek",
  "volume_set",
  "volume_mute",
  "view",
  "view_release",
  "printer_pause",
  "printer_resume",
  "printer_stop",
  "printer_clear_plate",
  "spool_save_weight",
  "spool_assign_slot",
  "spool_copy_to_tag",
  "spool_link_tag",
] as const

export type DeviceCommandAction =
  (typeof DEVICE_COMMAND_ACTIONS)[number]

/** The actions whose value is a printer id. */
const PRINTER_COMMAND_ACTIONS: readonly DeviceCommandAction[] =
  [
    "printer_pause",
    "printer_resume",
    "printer_stop",
    "printer_clear_plate",
  ]

/**
 * The actions whose value is a spool id and whose `payload` carries the rest.
 *
 * These are the one family the server EXECUTES rather than forwards: a spool
 * lives in the printer dashboard's inventory, which Home Assistant does not
 * hold, so the device's configured `spoolsChannel` source performs them and
 * nothing is published to the command topic. See
 * docs/filament-spool-scale-view.md.
 */
export const SPOOL_COMMAND_ACTIONS: readonly DeviceCommandAction[] =
  [
    "spool_save_weight",
    "spool_assign_slot",
    "spool_copy_to_tag",
    "spool_link_tag",
  ]

export const DeviceCommandSchema = z.object({
  action: z.enum(DEVICE_COMMAND_ACTIONS),
  /**
   * seek: seconds into the track; volume_set: 0.0–1.0; volume_mute: unused
   * (toggle); view: the requested view's `clientId`, a string; view_release:
   * unused; printer_pause / printer_resume / printer_stop: the printer's id.
   */
  value: z.optional(z.union([z.number(), z.string()])),
  /**
   * Structured arguments for the spool actions, which need more than one
   * value: `spool_save_weight` carries `grams`; `spool_assign_slot` carries
   * `printerId`, `amsId` and `trayId`; `spool_copy_to_tag` and
   * `spool_link_tag` carry `tagUid`, and optionally `tagType` and `trayUuid`.
   * Every other action leaves it out.
   */
  payload: z.optional(z.record(z.string(), z.unknown())),
})

export type DeviceCommand = z.infer<
  typeof DeviceCommandSchema
>

/**
 * Parse a client-sent command, or null when malformed. Range-checks the
 * value-carrying actions so a broken client can't publish garbage to HA.
 *
 * The printer actions carry the printer's id for the same reason `view` carries
 * a view id: the panel shows several machines at once, so a pause that named
 * nothing would be ambiguous. Which printer that id maps onto is Home
 * Assistant's call — CastKit only echoes back what HA pushed.
 *
 * `view` names a view rather than measuring one, so its value is a string and
 * the numeric range checks do not apply to it. Which views a device may ask
 * for is Home Assistant's call, not the client's: the automation maps the id
 * onto that display's `select` options and ignores anything it does not know.
 */
export const parseDeviceCommand = (
  payload: unknown,
): DeviceCommand | null => {
  const result = DeviceCommandSchema.safeParse(payload)
  if (!result.success) {
    return null
  }
  const command = result.data
  if (
    command.action === "seek" &&
    (typeof command.value !== "number" || command.value < 0)
  ) {
    return null
  }
  if (
    command.action === "volume_set" &&
    (typeof command.value !== "number" ||
      command.value < 0 ||
      command.value > 1)
  ) {
    return null
  }
  if (
    command.action === "view" &&
    (typeof command.value !== "string" ||
      command.value.length === 0)
  ) {
    return null
  }
  if (
    PRINTER_COMMAND_ACTIONS.includes(command.action) &&
    (typeof command.value !== "string" ||
      command.value.length === 0)
  ) {
    return null
  }
  if (SPOOL_COMMAND_ACTIONS.includes(command.action)) {
    return getIsSpoolCommandValid(command) ? command : null
  }
  return command
}

const getIsNonEmptyText = (value: unknown) =>
  typeof value === "string" && value.length > 0

/**
 * A spool command names a spool, and its payload carries what the action
 * needs. `spool_copy_to_tag` is the one exception on the spool id: it copies
 * FROM that spool, and the tag it links is in the payload.
 */
const getIsSpoolCommandValid = (command: DeviceCommand) => {
  if (!getIsNonEmptyText(command.value)) {
    return false
  }
  const payload = command.payload ?? {}
  switch (command.action) {
    case "spool_save_weight":
      return (
        typeof payload.grams === "number" &&
        Number.isFinite(payload.grams) &&
        payload.grams >= 0
      )
    case "spool_assign_slot":
      return (
        getIsNonEmptyText(payload.printerId) &&
        Number.isInteger(payload.amsId) &&
        Number.isInteger(payload.trayId)
      )
    case "spool_copy_to_tag":
    case "spool_link_tag":
      return getIsNonEmptyText(payload.tagUid)
    default:
      return true
  }
}
