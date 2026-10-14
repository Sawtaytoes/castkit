import { describe, expect, test, vi } from "vitest"
import {
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
