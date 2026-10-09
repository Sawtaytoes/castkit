import type { DisplaySnapshot } from "../protocol.ts"

/** Synthetic camera data uses the existing licensed landscape fixture. */
export const cameraAlertSnapshot: DisplaySnapshot = {
  target: { kind: "view", id: "camera-alert" },
  displayProperties: { delivery: "browser", repaint: "fast", power: "wired", hasTouch: false },
  canControl: false,
  view: {
    id: "camera-alert", name: "Camera Alert", layout: "single", theme: "dark", access: "public", isControlEnabled: false,
    panels: [{ id: "camera", specId: "camera-alert", bindings: { data: "camera" }, settings: { label: "Entrance", snapshotIntervalSeconds: 10 } }],
  },
  channels: {
    camera: { id: "camera", type: "cameras.v1", status: "ready", data: { cameras: [{ id: "entrance", name: "Entrance", url: "/sample-photos/landscape-gradient.jpg", isLive: false }] } },
  },
}
