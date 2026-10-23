import { describe, expect, test, vi } from "vitest"
import {
  buildApplicationMenu,
  buildTrayMenu,
  buildWindowPopupMenu,
  type MenuActions,
  type WindowMenuEntry,
} from "./appMenus.ts"
import type { NumberedDisplay } from "./displayMatching.ts"

const actions: MenuActions = {
  openSettings: vi.fn(),
  identifyDisplays: vi.fn(),
  openWindow: vi.fn(),
  toggleFullScreen: vi.fn(),
  reload: vi.fn(),
  zoom: vi.fn(),
  moveToDisplay: vi.fn(),
  removeWindow: vi.fn(),
  setLaunchAtLogin: vi.fn(),
  setPcAudioSending: vi.fn(),
  quit: vi.fn(),
}

const displays = [
  {
    id: 7,
    number: 1,
    name: "1: Small (1024 x 600)",
  },
] as NumberedDisplay[]

const entry: WindowMenuEntry = {
  id: "window-1",
  label: "Kitchen (/screen/kitchen)",
  displayId: 7,
  isFullScreen: true,
  isOpen: true,
}

const labels = (
  items: { label?: string; type?: string }[],
) =>
  items.map((item) =>
    item.type === "separator" ? "---" : item.label,
  )

describe(buildTrayMenu.name, () => {
  test("a closed window is listed as closed, and its menu opens or removes it", () => {
    const menu = buildTrayMenu({
      entries: [
        entry,
        { ...entry, id: "window-2", isOpen: false },
      ],
      displays,
      isLaunchedAtLogin: false,
      pcAudio: { isSending: false, statusText: null },
      actions,
    })
    const windows = menu.filter((item) => item.submenu)
    expect(labels(windows)).toEqual([
      "Kitchen (/screen/kitchen) on display 1",
      "Kitchen (/screen/kitchen) (closed)",
    ])
    const closedMenu = windows[1]?.submenu as {
      label?: string
      type?: string
      click?: () => void
    }[]
    expect(labels(closedMenu)).toEqual([
      "Open window",
      "---",
      "Remove window",
    ])
    closedMenu[0]?.click?.()
    expect(actions.openWindow).toHaveBeenCalledWith(
      "window-2",
    )
  })

  test("sending this computer's audio is a switch, with what it is doing under it", () => {
    const menu = buildTrayMenu({
      entries: [],
      displays,
      isLaunchedAtLogin: false,
      pcAudio: {
        isSending: true,
        statusText:
          "Sending everything this computer plays to music.local:6980.",
      },
      actions,
    })
    const switchIndex = menu.findIndex(
      (item) => item.label === "Send this computer's audio",
    )
    const audioSwitch = menu[switchIndex]
    expect(audioSwitch).toMatchObject({
      type: "checkbox",
      checked: true,
    })
    expect(menu[switchIndex + 1]).toEqual({
      label:
        "Sending everything this computer plays to music.local:6980.",
      enabled: false,
    })
    ;(audioSwitch?.click as (...args: unknown[]) => void)({
      checked: false,
    })
    expect(actions.setPcAudioSending).toHaveBeenCalledWith(
      false,
    )
  })

  test("while sending is off, the switch has no status line", () => {
    const menu = buildTrayMenu({
      entries: [],
      displays,
      isLaunchedAtLogin: false,
      pcAudio: { isSending: false, statusText: null },
      actions,
    })
    const switchIndex = menu.findIndex(
      (item) => item.label === "Send this computer's audio",
    )
    expect(menu[switchIndex + 1]).toEqual({
      type: "separator",
    })
  })
})

describe(buildWindowPopupMenu.name, () => {
  test("the right-click and fullscreen Alt menu reaches moving and the settings", () => {
    expect(
      labels(
        buildWindowPopupMenu({ entry, displays, actions }),
      ),
    ).toEqual([
      "Fullscreen",
      "Reload",
      "---",
      "Zoom in",
      "Zoom out",
      "Actual size",
      "---",
      "Move to display",
      "---",
      "Remove window",
      "---",
      "Add window…",
      "Server and settings…",
    ])
  })
})

describe(buildApplicationMenu.name, () => {
  test("carries Edit, and the focused window's menu only when a page window has the focus", () => {
    const withWindow = buildApplicationMenu({
      entry,
      displays,
      isLaunchedAtLogin: true,
      actions,
    })
    expect(
      withWindow.map((item) => item.label ?? item.role),
    ).toEqual(["CastKit", "editMenu", "Window"])

    const withoutWindow = buildApplicationMenu({
      entry: null,
      displays,
      isLaunchedAtLogin: true,
      actions,
    })
    expect(
      withoutWindow.map((item) => item.label ?? item.role),
    ).toEqual(["CastKit", "editMenu"])
  })

  test("Command-Q quits", () => {
    const [castkitMenu] = buildApplicationMenu({
      entry: null,
      displays,
      isLaunchedAtLogin: false,
      actions,
    })
    const quit = (
      castkitMenu?.submenu as {
        label?: string
        accelerator?: string
      }[]
    ).find((item) => item.label === "Quit CastKit")
    expect(quit?.accelerator).toBe("Command+Q")
  })
})
