import { z } from "zod"

/** Available rear-light effects, shared by management, MQTT and receivers. */
export const AMBIENT_LIGHT_MODES = [
  "album-glow",
  "swipe-comet",
  "meeting-fuse",
  "weather-aura",
  "progress-bar",
] as const
/** Persisted independent rear-light controls; effect metadata is not configuration. */
export const ambientLightSchema = z.object({
  isOn: z.boolean(),
  brightness: z.number().int().min(0).max(100),
  mode: z.enum(AMBIENT_LIGHT_MODES),
  demo: z.boolean(),
})
/** Receiver-facing desired ambient-light state. */
export type AmbientLightState = z.infer<
  typeof ambientLightSchema
>
/** New installations start with ambient LEDs off at a modest remembered level. */
export const DEFAULT_AMBIENT_LIGHT: AmbientLightState = {
  isOn: false,
  brightness: 5,
  mode: "album-glow",
  demo: false,
}
