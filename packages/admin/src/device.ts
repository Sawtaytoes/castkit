export type Device = {
  id: string
  label: string
  mac: string
  renderer?: "browser"
  width: number
  height: number
  colorMode?: "monochrome" | "grayscale" | "spectra6"
  color?: "monochrome" | "grayscale" | "spectra6" | "full"
  rotation?: 0 | 90 | 180 | 270
  shape?: "square" | "round" | "rectangle"
  hasTouch?: boolean
  hasViewDrawer?: boolean
  printQueueChannel?: string
  /** A backlight agent listens on the device's MQTT light topics. */
  hasMqttBacklight?: boolean
  /** Backlight commands travel directly with remote display frames. */
  hasRemoteBacklight?: boolean
  /** Independent ambient LEDs receive persisted controls alongside remote frames. */
  hasRemoteAmbientLight?: boolean
  /** Ordered allow-list. Absent means every compatible view. */
  views?: string[]
  externalViews?: {
    name: string
    url: string
    zoom?: number
    healthUrl?: string
  }[]
}

export type AutomationSettings = Record<string, string>
