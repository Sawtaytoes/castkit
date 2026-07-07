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
] as const

export type DeviceCommandAction =
  (typeof DEVICE_COMMAND_ACTIONS)[number]

export const DeviceCommandSchema = z.object({
  action: z.enum(DEVICE_COMMAND_ACTIONS),
  /** seek: seconds into the track; volume_set: 0.0–1.0; volume_mute: unused (toggle). */
  value: z.optional(z.number()),
})

export type DeviceCommand = z.infer<
  typeof DeviceCommandSchema
>

/**
 * Parse a client-sent command, or null when malformed. Range-checks the
 * value-carrying actions so a broken client can't publish garbage to HA.
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
    (command.value === undefined || command.value < 0)
  ) {
    return null
  }
  if (
    command.action === "volume_set" &&
    (command.value === undefined ||
      command.value < 0 ||
      command.value > 1)
  ) {
    return null
  }
  return command
}
