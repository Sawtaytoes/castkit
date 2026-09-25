import type {
  ChannelSnapshot,
  ScreenDefinition,
  ViewDefinition,
} from "@castkit/sdk/contracts"
import type { ViewInput } from "@castkit/sdk/plugin"
import type { DisplayProperties } from "./displayProperties.ts"

/** The same target identity controls page data, media, sessions, and actions. */
export type DisplayTarget = {
  kind: "view" | "screen"
  deviceId?: string
  id: string
}

/** A complete authoritative composition, delivered at connection and after changes. */
export type DisplaySnapshot = {
  target: DisplayTarget
  view: ViewDefinition
  channels: Record<string, ChannelSnapshot>
  availableViews?: { id: string; name: string }[]
  screen?: ScreenDefinition
  // Wire field shared with the display API.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  canControl: boolean
  viewSpecs?: {
    id: string
    browserEntry?: string
    inputs?: ViewInput[]
  }[]
  displayProperties?: DisplayProperties
  buildId?: string
}

/** A panel command always includes its configured panel identity. */
export type PanelAction = {
  input?: string
  panelId: string
  action: string
  payload?: Record<string, unknown>
}

/** Recognize browser targets without changing the existing device route. */
export const readDisplayTarget = (
  pathname: string,
): DisplayTarget | null => {
  const matched = /^\/(view|screen)\/([^/]+)\/?$/.exec(
    pathname,
  )
  if (!matched) {
    return null
  }
  try {
    return {
      kind: matched[1] as DisplayTarget["kind"],
      id: decodeURIComponent(matched[2]!),
    }
  } catch {
    return null
  }
}

/** Only media served through CastKit is rendered; integrations keep their credentials server-side. */
export const safeMediaUrl = (value: unknown) =>
  typeof value === "string" &&
  value.startsWith("/") &&
  !value.startsWith("//") &&
  !value.includes("\\")
    ? value
    : undefined

/** A physical display can bind a named screen while its installed URL stays fixed. */
export const readInlineDisplayTarget =
  (): DisplayTarget | null => {
    const element = document.getElementById(
      "castkit-platform-target",
    )
    if (!element?.textContent) {
      return null
    }
    try {
      const target = JSON.parse(element.textContent)
      return (target.kind === "view" ||
        target.kind === "screen") &&
        typeof target.id === "string" &&
        target.id.length > 0
        ? {
            kind: target.kind,
            id: target.id,
            ...(typeof target.deviceId === "string"
              ? { deviceId: target.deviceId }
              : {}),
          }
        : null
    } catch {
      return null
    }
  }
