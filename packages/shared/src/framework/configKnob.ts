/**
 * One HA-editable config knob: how its MQTT payload is validated/normalized
 * into the config store, and what to do after a user change. The retained
 * state topic doubles as boot-time persistence (`restore`) — this is the
 * platform's "retained MQTT is the database" pattern, shared by both client
 * modes. See docs/decisions/2026-07-03-user-tunable-view-settings-are-ha-config-entities.md.
 */
export type ConfigKnob = {
  /** Store the (valid) payload; returns the normalized retained-state payload, or null to reject. */
  applyPayload: (params: {
    deviceId: string
    payload: string
  }) => string | null
  /** Whether the store already has a value (blocks the boot-time restore). */
  getHasValue: (deviceId: string) => boolean
  /** Re-render / re-fetch after a user change (not after a restore). */
  onApplied?: (deviceId: string) => Promise<void>
}
