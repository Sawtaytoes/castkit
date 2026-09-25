import type { ChannelSnapshot } from "./contracts.ts"

/** Framework-neutral host hooks provided to a custom view renderer. */
export type ViewHost = {
  getChannel: (input: string) => ChannelSnapshot | undefined
  subscribe: (listener: () => void) => () => void
  executeAction: (request: {
    input: string
    action: string
    payload?: Record<string, unknown>
  }) => Promise<unknown>
  settings: Readonly<Record<string, unknown>>
  theme?: ViewTheme
  isControlEnabled: boolean
  mediaUrl: (request: {
    input: string
    assetId: string
    kind?: string
  }) => string
}
/** Optional CSS theme properties; consumers may supply their own components. */
export type ViewTheme = {
  background: string
  foreground: string
  accent: string
  muted: string
  fontFamily: string
}
/** A framework-independent browser renderer supplied by an installed view package. */
export type BrowserRenderer = {
  mount: (
    element: HTMLElement,
    host: ViewHost,
  ) => {
    update: (host: ViewHost) => void
    destroy: () => void
  }
}
