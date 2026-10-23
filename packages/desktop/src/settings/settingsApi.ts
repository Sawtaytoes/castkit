import type { CastkitPage } from "../castkitTargets.ts"
import type {
  PcAudioSettings,
  PcAudioStatus,
} from "../pcAudioSettings.ts"
import type { FoundServer } from "../serverDiscovery.ts"

/** A monitor as the settings page lists it. */
export type SettingsDisplay = {
  id: number
  number: number
  label: string
  width: number
  height: number
  isPrimary: boolean
}

/** A window as the settings page lists it, open or closed. */
export type SettingsWindow = {
  id: string
  title: string
  path: string
  /** The display's number, or `null` when that monitor is not connected. */
  displayNumber: number | null
  isOpen: boolean
}

/** Sending this computer's audio, as the settings page shows it. */
export type PcAudioSnapshot = {
  settings: PcAudioSettings
  status: PcAudioStatus
  /** Only Windows can capture everything the computer plays. */
  isSystemAudioCapturable: boolean
  /** This computer's IPv4 addresses: the receiver accepts packets from one of them. */
  computerAddresses: string[]
}

/** What the settings page shows when it opens. */
export type SettingsSnapshot = {
  serverOrigin: string | null
  displays: SettingsDisplay[]
  windows: SettingsWindow[]
  pcAudio: PcAudioSnapshot
}

/** The server's pages, or why there are none. */
export type PagesResult =
  | { pages: CastkitPage[]; error: null }
  | { pages: []; error: string }

/** What a network scan found, and where it looked. */
export type ScanResult = {
  servers: FoundServer[]
  /** The networks swept, as "10.1.0.x". */
  networks: string[]
}

/** A request from the settings page to open a new window. */
export type AddWindowRequest = {
  page: string
  displayId: number
  isFullScreen: boolean
}

/** The answer to a change the settings page asked for. */
export type SettingsResult =
  | { isDone: true }
  | { isDone: false; error: string }

/** The bridge the settings preload puts on `window.castkitDesktop`. */
export type CastkitDesktopApi = {
  readSettings: () => Promise<SettingsSnapshot>
  readPages: () => Promise<PagesResult>
  saveServerOrigin: (
    input: string,
  ) => Promise<SettingsResult>
  scanForServers: () => Promise<ScanResult>
  addWindow: (
    request: AddWindowRequest,
  ) => Promise<SettingsResult>
  openWindow: (windowId: string) => Promise<SettingsResult>
  removeWindow: (
    windowId: string,
  ) => Promise<SettingsResult>
  /** Change how this computer's audio is sent; only the fields given change. */
  savePcAudio: (
    change: Partial<PcAudioSettings>,
  ) => Promise<SettingsResult>
  highlightDisplay: (displayId: number | null) => void
  /** Call `onChange` whenever the windows or the displays change. Returns the unsubscribe. */
  watchSettings: (onChange: () => void) => () => void
}
