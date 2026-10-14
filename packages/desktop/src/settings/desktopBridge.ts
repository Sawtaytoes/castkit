import type { CastkitDesktopApi } from "./settingsApi.ts"

declare global {
  interface Window {
    castkitDesktop: CastkitDesktopApi
  }
}

/** The settings preload's bridge to the main process. */
export const readDesktopBridge = () => window.castkitDesktop
