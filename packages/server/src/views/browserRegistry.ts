import type { BrowserDeviceConfig } from "../config/env.ts"

/**
 * The browser-mode (Slatecast) view registry. Names double as the HA View
 * select options and the MQTT `view/set` payloads (same convention as image
 * views); `clientId` is what the SPA switches on over the WebSocket.
 *
 * Each view declares capability requirements — a device's View select only
 * offers the views it satisfies, so HA can never switch a touchless display
 * into an interactive-only view. (No current view requires touch: Now Playing
 * degrades to display-only controls client-side.)
 */
export type BrowserViewDefinition = {
  name: string
  clientId: string
  isTouchRequired: boolean
}

const getExternalViewsForDevice = (
  device: BrowserDeviceConfig,
): readonly BrowserViewDefinition[] =>
  device.externalViews.map((view, index) => ({
    name: view.name,
    clientId: `external-view:${index}`,
    isTouchRequired: true,
  }))

export const BROWSER_VIEWS: readonly BrowserViewDefinition[] =
  [
    {
      name: "Now Playing",
      clientId: "now-playing",
      isTouchRequired: false,
    },
    {
      name: "Queue",
      clientId: "queue",
      isTouchRequired: false,
    },
    {
      name: "Ambient",
      clientId: "ambient",
      isTouchRequired: false,
    },
    {
      name: "Clock",
      clientId: "clock",
      isTouchRequired: false,
    },
    {
      name: "Weather",
      clientId: "weather",
      isTouchRequired: false,
    },
    {
      name: "Calendar",
      clientId: "calendar",
      isTouchRequired: false,
    },
    {
      name: "Photo Frame",
      clientId: "photo-frame",
      isTouchRequired: false,
    },
    {
      name: "Printer Status",
      clientId: "printer-status",
      // The card's Pause and Stop are the reason the view exists on the
      // workbench panel. A display-only screen would show controls nobody can
      // press, so the view is offered to touch panels only.
      isTouchRequired: true,
    },
    {
      name: "Touch Test",
      clientId: "touch-test",
      isTouchRequired: true,
    },
  ]

export const DEFAULT_BROWSER_VIEW = BROWSER_VIEWS[0]!

/** The views this device's capabilities allow. */
export const getBrowserViewsForDevice = (
  device: BrowserDeviceConfig,
): readonly BrowserViewDefinition[] => {
  const compatibleViews = BROWSER_VIEWS.concat(
    getExternalViewsForDevice(device),
  ).filter(
    (view) => !view.isTouchRequired || device.hasTouch,
  )

  if (!device.views) {
    return compatibleViews
  }

  const duplicateNames = device.views.filter(
    (name, index, names) => names.indexOf(name) !== index,
  )
  if (duplicateNames.length > 0) {
    throw new Error(
      `Browser device ${device.id} repeats configured view: ${duplicateNames[0]}`,
    )
  }

  const compatibleByName = new Map(
    compatibleViews.map((view) => [view.name, view]),
  )
  return device.views.map((name) => {
    const view = compatibleByName.get(name)
    if (!view) {
      throw new Error(
        `Browser device ${device.id} has unknown or incompatible configured view: ${name}`,
      )
    }
    return view
  })
}

export const getBrowserViewByName = ({
  device,
  name,
}: {
  device: BrowserDeviceConfig
  name: string
}): BrowserViewDefinition | undefined =>
  getBrowserViewsForDevice(device).find(
    (view) => view.name === name,
  )
