/**
 * In-memory per-browser-device backlight LEVEL (0–100 %), owned by CastKit for
 * every `hasMqttBacklight` device. The panel's own backlight agent (kiosk Pi
 * service or ESPHome firmware) executes `backlight/brightness/set` and keeps
 * nothing across a reboot; the HA `light` entity only ever sends what the user
 * last touched. This store is the one place the level survives, and the
 * retained `backlight_level` state topic is its persistence — the server
 * restores it on boot exactly like theme and rotation.
 *
 * NOT in `BrowserDeviceSettings`: the SPA never applies it (a browser cannot
 * reach a backlight), so it stays off the settings push.
 */
export type BrowserBacklightStore = ReturnType<
  typeof createBrowserBacklightStore
>

/** Full brightness, so an untouched device behaves exactly as before. */
export const DEFAULT_BACKLIGHT_PERCENT = 100

/** The HA light's `brightness_scale` (and the agent's PWM range). */
export const BACKLIGHT_BRIGHTNESS_SCALE = 255

/** 0–100 % → 0–255, rounded to the nearest step. */
export const percentToBrightness = (percent: number) =>
  Math.round((percent * BACKLIGHT_BRIGHTNESS_SCALE) / 100)

/** 0–255 → 0–100 %, rounded to the nearest whole percent. */
export const brightnessToPercent = (brightness: number) =>
  Math.round(
    (brightness * 100) / BACKLIGHT_BRIGHTNESS_SCALE,
  )

const parseBoundedInteger = ({
  payload,
  maximum,
}: {
  payload: string
  maximum: number
}): number | null => {
  const trimmed = payload.trim()
  if (!/^\d+$/.test(trimmed)) {
    return null
  }
  const value = Number.parseInt(trimmed, 10)
  return value <= maximum ? value : null
}

/** A whole percent 0–100, or null when the payload is unusable. */
export const parseBacklightPercentPayload = (
  payload: string,
) => parseBoundedInteger({ payload, maximum: 100 })

/** A whole brightness 0–255 (the HA light's scale), or null. */
export const parseBacklightBrightnessPayload = (
  payload: string,
) =>
  parseBoundedInteger({
    payload,
    maximum: BACKLIGHT_BRIGHTNESS_SCALE,
  })

export const createBrowserBacklightStore = () => {
  const percentByDeviceId = new Map<string, number>()

  return {
    getPercent: (deviceId: string) =>
      percentByDeviceId.get(deviceId) ??
      DEFAULT_BACKLIGHT_PERCENT,
    setPercent: ({
      deviceId,
      percent,
    }: {
      deviceId: string
      percent: number
    }) => {
      percentByDeviceId.set(deviceId, percent)
    },
  }
}
