import type { MenuItemConstructorOptions } from "electron"
import type { NumberedDisplay } from "./displayMatching.ts"
import type { ZoomRequest } from "./windowManager.ts"

/** One window as the menus list it. */
export type WindowMenuEntry = {
  id: string
  label: string
  displayId: number
  isFullScreen: boolean
  /** False while the window is closed and kept. */
  isOpen: boolean
}

/** What the menus can ask the app to do. */
export type MenuActions = {
  openSettings: () => void
  identifyDisplays: () => void
  openWindow: (windowId: string) => void
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
  setPcAudioSending: (isSending: boolean) => void
  quit: () => void
}

/** Sending this computer's audio, as the tray shows it. */
export type PcAudioMenuState = {
  isSending: boolean
  /** One line that says what sending is doing, or `null` while it is off. */
  statusText: string | null
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
}): MenuItemConstructorOptions[] =>
  entry.isOpen
    ? buildOpenWindowMenu({ entry, displays, actions })
    : [
        {
          label: "Open window",
          click: () => actions.openWindow(entry.id),
        },
        { type: "separator" },
        {
          label: "Remove window",
          click: () => actions.removeWindow(entry.id),
        },
      ]

const buildOpenWindowMenu = ({
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
  pcAudio,
  actions,
}: {
  entries: WindowMenuEntry[]
  displays: NumberedDisplay[]
  isLaunchedAtLogin: boolean
  pcAudio: PcAudioMenuState
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
            label: entry.isOpen
              ? `${entry.label} on display ${displayNumber(entry.displayId) ?? "?"}`
              : `${entry.label} (closed)`,
            submenu: buildWindowMenu({
              entry,
              displays,
              actions,
            }),
          }),
        )),
    { type: "separator" },
    {
      label: "Send this computer's audio",
      type: "checkbox",
      checked: pcAudio.isSending,
      click: (item) =>
        actions.setPcAudioSending(item.checked),
    },
    ...(pcAudio.statusText === null
      ? []
      : [{ label: pcAudio.statusText, enabled: false }]),
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

/**
 * The menu a page window opens on a right click, and on Alt in fullscreen:
 * the window's own actions, then the way to the settings window. In
 * fullscreen it is the only menu, so it carries everything the bar would.
 */
export const buildWindowPopupMenu = ({
  entry,
  displays,
  actions,
}: {
  entry: WindowMenuEntry
  displays: NumberedDisplay[]
  actions: MenuActions
}): MenuItemConstructorOptions[] => {
  const items = buildAppItems({
    isLaunchedAtLogin: false,
    actions,
  })
  return [
    ...buildWindowMenu({ entry, displays, actions }),
    { type: "separator" },
    items.addWindow,
    items.settings,
  ]
}

/**
 * The macOS menu bar. macOS has one menu bar for the whole app, not one per
 * window, so it follows the focused window: the CastKit menu, Edit (without
 * it, Command-C and Command-V do nothing in the settings fields), and the
 * focused page window's own menu when a page window has the focus.
 */
export const buildApplicationMenu = ({
  entry,
  displays,
  isLaunchedAtLogin,
  actions,
}: {
  entry: WindowMenuEntry | null
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
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { ...items.quit, accelerator: "Command+Q" },
      ],
    },
    { role: "editMenu" },
    ...(entry === null
      ? []
      : [
          {
            label: "Window",
            submenu: buildWindowMenu({
              entry,
              displays,
              actions,
            }),
          },
        ]),
  ]
}
