/**
 * Generic Home Assistant MQTT-discovery primitives shared by both client
 * modes. The per-mode entity lists live with the server (they know which
 * knobs a device class carries); these are the shapes and the one topic every
 * entity's availability points at.
 */

export type HaDiscoveryConfig = {
  /** HA's discovery prefix. Default `homeassistant`. */
  discoveryPrefix?: string
  /** Groups these entities under one discovery node. */
  nodeId?: string
  /** Root of the runtime state/command topics. */
  baseTopic?: string
}

export type DiscoveryMessage = {
  topic: string
  payload: Record<string, unknown>
  isRetained: true
}

/**
 * The single bridge-level availability topic. One LWT on this topic marks
 * every entity offline if the server disconnects — availability here means
 * "the CastKit server is connected", which is what HA should reflect.
 *
 * The default base stays `inkcast` until the fleet topic migration (see
 * docs/decisions/2026-07-07-flat-castkit-topics-migration-gated.md).
 */
export const buildAvailabilityTopic = (
  baseTopic = "inkcast",
): string => `${baseTopic}/availability`
