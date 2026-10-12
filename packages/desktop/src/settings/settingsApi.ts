import type { CastkitTarget } from "../castkitTargets.ts"

/** What the settings page shows when it opens. */
export type SettingsSnapshot = {
  serverOrigin: string | null
  displays: {
    id: number
    name: string
    isPrimary: boolean
  }[]
  targets: CastkitTarget[]
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
  saveServerOrigin: (
    input: string,
  ) => Promise<SettingsResult>
  addWindow: (
    request: AddWindowRequest,
  ) => Promise<SettingsResult>
}
