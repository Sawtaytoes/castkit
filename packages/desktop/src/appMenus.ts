import type { MenuItemConstructorOptions } from "electron"
import type { NumberedDisplay } from "./displayMatching.ts"
import type { ZoomRequest } from "./windowManager.ts"

/** One window as the menus list it. */
export type WindowMenuEntry = {
  id: string
  label: string
  displayId: number
  isFullScreen: boolean
}

/** What the menus can ask the app to do. */
export type MenuActions = {
  openSettings: () => void
  identifyDisplays: () => void
  toggleFullScreen: (windowId: string) => void
  reload: (windowId: string) => void
  zoom: (request: {
    windowId: string
    request: ZoomRequest
  }) => void
  moveToDisplay: (request: {
    windowId: string
    displayId: number
  }) => void
  removeWindow: (windowId: string) => void
  setLaunchAtLogin: (isLaunchedAtLogin: boolean) => void
  quit: () => void
}

// The page windows handle these keys themselves (`before-input-event`), so
// they work in fullscreen where no menu bar shows. The menus only display them.
const shortcut = (accelerator: string) => ({
  accelerator,
  registerAccelerator: false,
})

/** The actions for one window, used in its own menu and in the tray. */
export const buildWindowMenu = ({
  entry,
  displays,
  actions,
}: {
  entry: WindowMenuEntry
  displays: NumberedDisplay[]
  actions: MenuActions
}): MenuItemConstructorOptions[] => [
  {
    label: "Fullscreen",
    type: "checkbox",
    checked: entry.isFullScreen,
    ...shortcut("F11"),
    click: () => actions.toggleFullScreen(entry.id),
  },
  {
    label: "Reload",
    ...shortcut("CommandOrControl+R"),
    click: () => actions.reload(entry.id),
  },
  { type: "separator" },
  {
    label: "Zoom in",
    ...shortcut("CommandOrControl+="),
    click: () =>
      actions.zoom({ windowId: entry.id, request: "in" }),
  },
  {
    label: "Zoom out",
    ...shortcut("CommandOrControl+-"),
    click: () =>
      actions.zoom({ windowId: entry.id, request: "out" }),
  },
  {
    label: "Actual size",
    ...shortcut("CommandOrControl+0"),
    click: () =>
      actions.zoom({
        windowId: entry.id,
        request: "reset",
      }),
  },
  { type: "separator" },
  {
    label: "Move to display",
    submenu: [
      {
        label: "Identify displays",
        click: actions.identifyDisplays,
      },
      { type: "separator" },
      ...displays.map(
        (display): MenuItemConstructorOptions => ({
          label: display.name,
          type: "radio",
          checked: display.id === entry.displayId,
          click: () =>
            actions.moveToDisplay({
              windowId: entry.id,
              displayId: display.id,
            }),
        }),
      ),
    ],
  },
  { type: "separator" },
  {
    label: "Remove window",
    click: () => actions.removeWindow(entry.id),
  },
]

const buildAppItems = ({
  isLaunchedAtLogin,
  actions,
}: {
  isLaunchedAtLogin: boolean
  actions: MenuActions
}) => ({
  addWindow: {
    label: "Add window…",
    click: actions.openSettings,
  } satisfies MenuItemConstructorOptions,
  settings: {
    label: "Server and settings…",
    click: actions.openSettings,
  } satisfies MenuItemConstructorOptions,
  identify: {
    label: "Identify displays",
    click: actions.identifyDisplays,
  } satisfies MenuItemConstructorOptions,
  launchAtLogin: {
    label: "Launch at login",
    type: "checkbox",
    checked: isLaunchedAtLogin,
    click: (item) => actions.setLaunchAtLogin(item.checked),
  } satisfies MenuItemConstructorOptions,
  quit: {
    label: "Quit CastKit",
    click: actions.quit,
  } satisfies MenuItemConstructorOptions,
})

/**
 * The tray menu: app actions, then one submenu per window. It is the one
 * surface that reaches every window, including a fullscreen one on a monitor
 * with no keyboard nearby.
 */
export const buildTrayMenu = ({
  entries,
  displays,
  isLaunchedAtLogin,
  actions,
}: {
  entries: WindowMenuEntry[]
  displays: NumberedDisplay[]
  isLaunchedAtLogin: boolean
  actions: MenuActions
}): MenuItemConstructorOptions[] => {
  const items = buildAppItems({
    isLaunchedAtLogin,
    actions,
  })
  const displayNumber = (displayId: number) =>
    displays.find((display) => display.id === displayId)
      ?.number
  return [
    items.addWindow,
    items.settings,
    items.identify,
    { type: "separator" },
    ...(entries.length === 0
      ? [{ label: "No windows yet", enabled: false }]
      : entries.map(
          (entry): MenuItemConstructorOptions => ({
            label: `${entry.label} on display ${displayNumber(entry.displayId) ?? "?"}`,
            submenu: buildWindowMenu({
              entry,
              displays,
              actions,
            }),
          }),
        )),
    { type: "separator" },
    items.launchAtLogin,
    items.quit,
  ]
}

/**
 * A page window's own menu bar (Alt shows it; it hides again by itself). The
 * same window menu opens on a right click with the mouse.
 */
export const buildWindowMenuBar = ({
  entry,
  displays,
  isLaunchedAtLogin,
  actions,
}: {
  entry: WindowMenuEntry
  displays: NumberedDisplay[]
  isLaunchedAtLogin: boolean
  actions: MenuActions
}): MenuItemConstructorOptions[] => {
  const items = buildAppItems({
    isLaunchedAtLogin,
    actions,
  })
  return [
    {
      label: "CastKit",
      submenu: [
        items.addWindow,
        items.settings,
        items.identify,
        { type: "separator" },
        items.launchAtLogin,
        items.quit,
      ],
    },
    {
      label: "Window",
      submenu: buildWindowMenu({
        entry,
        displays,
        actions,
      }),
    },
  ]
}
