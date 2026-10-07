import { z } from "zod"

/** Available rear-light effects, shared by management, MQTT and receivers. */
export const AMBIENT_LIGHT_MODES = [
  "album-glow",
  "swipe-comet",
  "meeting-fuse",
  "weather-aura",
  "progress-bar",
] as const
/** A view may deliberately keep ambient LEDs dark. */
export const AMBIENT_LIGHT_VIEW_MODES = [
  ...AMBIENT_LIGHT_MODES,
  "off",
] as const
/** Builtin client IDs keep default rules independent of display names. */
export const DEFAULT_AMBIENT_LIGHT_VIEW_MODES = {
  "builtin:now-playing": "album-glow",
  "builtin:queue": "progress-bar",
  "builtin:calendar": "meeting-fuse",
  "builtin:ambient": "weather-aura",
  "builtin:clock": "weather-aura",
  "builtin:weather": "weather-aura",
  "builtin:touch-test": "swipe-comet",
} as const
/** Rules use separate namespaces for builtin clients and platform view identities. */
export const ambientLightViewModesSchema = z.record(
  z
    .string()
    .regex(/^(builtin|view):[a-z0-9][a-z0-9-]*$/)
    .max(160),
  z.enum(AMBIENT_LIGHT_VIEW_MODES),
)
/** Persisted independent rear-light controls; effect metadata is not configuration. */
export const ambientLightSchema = z.object({
  isOn: z.boolean(),
  brightness: z.number().int().min(0).max(100),
  mode: z.enum(AMBIENT_LIGHT_MODES),
  demo: z.boolean(),
  followView: z.boolean().default(false),
  viewModes: ambientLightViewModesSchema.default(
    DEFAULT_AMBIENT_LIGHT_VIEW_MODES,
  ),
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
  followView: false,
  viewModes: DEFAULT_AMBIENT_LIGHT_VIEW_MODES,
}
