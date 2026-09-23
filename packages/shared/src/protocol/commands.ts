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
] as const

export type DeviceCommandAction =
  (typeof DEVICE_COMMAND_ACTIONS)[number]

/** The actions whose value is a printer id. */
const PRINTER_COMMAND_ACTIONS: readonly DeviceCommandAction[] =
  ["printer_pause", "printer_resume", "printer_stop"]

export const DeviceCommandSchema = z.object({
  action: z.enum(DEVICE_COMMAND_ACTIONS),
  /**
   * seek: seconds into the track; volume_set: 0.0–1.0; volume_mute: unused
   * (toggle); view: the requested view's `clientId`, a string; view_release:
   * unused; printer_pause / printer_resume / printer_stop: the printer's id.
   */
  value: z.optional(z.union([z.number(), z.string()])),
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
  return command
}
