import type { BrowserDeviceProfile } from "@castkit/shared/protocol/ws"

/**
 * The two browser-mode panels the example config ships. Slatecast is sized in
 * viewport units, so a story is only faithful when the preview viewport is the
 * panel's own dimensions — these feed both the per-view stories' viewport
 * presets and the all-screens matrix's per-device iframes.
 */

export const MEDIA_CONTROLS_PROFILE: BrowserDeviceProfile =
  {
    id: "media-controls",
    label: "Media Controls (square, touch)",
    width: 720,
    height: 720,
    shape: "square",
    hasTouch: true,
    colour: "full",
  }

export const PORTHOLE_PROFILE: BrowserDeviceProfile = {
  id: "porthole",
  label: "Porthole (round)",
  width: 480,
  height: 480,
  shape: "round",
  hasTouch: false,
  colour: "full",
}

export const BROWSER_DEVICE_PROFILES: readonly BrowserDeviceProfile[] =
  [MEDIA_CONTROLS_PROFILE, PORTHOLE_PROFILE]
