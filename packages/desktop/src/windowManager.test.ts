import {
  afterEach,
  beforeEach,
  expect,
  test,
  vi,
} from "vitest"
import type { SavedWindow } from "./desktopState.ts"

const monitors = vi.hoisted(() => ({
  displays: [
    {
      id: 1,
      label: "Primary",
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
    },
    {
      id: 2,
      label: "Side",
      bounds: { x: 1920, y: 0, width: 1024, height: 600 },
      workArea: { x: 1920, y: 0, width: 1024, height: 560 },
    },
  ],
}))

vi.mock("electron", async () => {
  const { EventEmitter } = await import("node:events")
  class PageWindow extends EventEmitter {
    bounds: SavedWindow["windowBounds"]
    isFullscreen = false
    webContents = Object.assign(new EventEmitter(), {
      setWindowOpenHandler: vi.fn(),
      setZoomFactor: vi.fn(),
      getURL: () =>
        "https://castkit.example.test/screen/first",
    })
    constructor(bounds: SavedWindow["windowBounds"]) {
      super()
      this.bounds = bounds
    }
    isDestroyed = () => false
    isFullScreen = () => this.isFullscreen
    isMaximized = () => false
    getBounds = () => this.bounds
    getNormalBounds = () => this.bounds
    show = () => undefined
    loadURL = async () => undefined
    setFullScreen = (isFullScreen: boolean) => {
      this.isFullscreen = isFullScreen
      this.emit(
        isFullScreen
          ? "enter-full-screen"
          : "leave-full-screen",
      )
    }
    setBounds = (bounds: SavedWindow["windowBounds"]) => {
      this.bounds = bounds
      this.emit("move")
      this.emit("resize")
    }
  }
  return {
    BrowserWindow: PageWindow,
    screen: {
      getAllDisplays: () => monitors.displays,
      getPrimaryDisplay: () => monitors.displays[0],
      getDisplayMatching: (
        bounds: SavedWindow["windowBounds"],
      ) =>
        monitors.displays.find(
          (display) =>
            bounds.x >= display.bounds.x &&
            bounds.x <
              display.bounds.x + display.bounds.width,
        ) ?? monitors.displays[0],
    },
    session: {
      fromPartition: () => ({
        setPermissionRequestHandler: vi.fn(),
      }),
    },
    shell: { openExternal: vi.fn() },
  }
})

const { createWindowManager } = await import(
  "./windowManager.ts"
)
const side = { ...monitors.displays[1] }
const record: SavedWindow = {
  id: "window-test",
  url: "https://castkit.example.test/screen/first",
  displayId: side.id,
  displayLabel: side.label,
  displayBounds: side.bounds,
  windowBounds: { x: 1950, y: 30, width: 800, height: 480 },
  isFullScreen: true,
  isClosed: false,
  title: "",
  zoomByView: {},
}
const openManager = async (saved = record) => {
  const manager = createWindowManager({
    readServerOrigin: () => "https://castkit.example.test",
    preloadPath: "",
    iconPath: "",
    onRecordsChanged: vi.fn(),
    onWindowMenu: vi.fn(),
    attachSignIn: async () => undefined,
    detachSignIn: vi.fn(),
    log: vi.fn(),
  })
  manager.restore(saved)
  const browserWindow = manager.readBrowserWindow(saved.id)
  if (!browserWindow) {
    throw new Error("Window did not open")
  }
  browserWindow.emit("ready-to-show")
  await vi.advanceTimersByTimeAsync(200)
  return { manager, browserWindow }
}

beforeEach(() => {
  vi.useFakeTimers()
  monitors.displays = [monitors.displays[0], side]
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

test("a main-frame navigation and an in-page navigation are restored on restart", async () => {
  const { manager, browserWindow } = await openManager()
  const next =
    "https://castkit.example.test/view/next?mode=board"
  browserWindow.webContents.emit("did-navigate", {}, next)
  expect(manager.readRecords()[0].url).toBe(next)
  browserWindow.webContents.emit(
    "did-navigate-in-page",
    {},
    `${next}#details`,
    true,
  )
  expect(manager.readRecords()[0].url).toBe(
    `${next}#details`,
  )
  browserWindow.webContents.emit(
    "did-navigate-in-page",
    {},
    "https://elsewhere.test/",
    false,
  )
  expect(manager.readRecords()[0].url).toBe(
    `${next}#details`,
  )
})

test("unplugging a running window's display preserves placement and fullscreen until it returns", async () => {
  const { manager, browserWindow } = await openManager()
  monitors.displays = [monitors.displays[0]]
  // Windows may relocate the window before delivering display-removed.
  browserWindow.setBounds({
    x: 0,
    y: 0,
    width: 800,
    height: 480,
  })
  browserWindow.setFullScreen(false)
  manager.returnWindowsToDisplays()
  expect(manager.readRecords()[0]).toMatchObject(record)
  monitors.displays = [
    ...monitors.displays,
    { ...side, id: 22 },
  ]
  manager.returnWindowsToDisplays()
  await vi.advanceTimersByTimeAsync(200)
  expect(browserWindow.getBounds()).toMatchObject(
    record.windowBounds,
  )
  expect(browserWindow.isFullScreen()).toBe(true)
  expect(manager.readRecords()[0]).toMatchObject({
    ...record,
    displayId: 22,
  })
  expect(manager.readMenuEntries()[0].displayId).toBe(22)
})

test("finding a renumbered monitor on startup updates the menu without needing a manual move", async () => {
  monitors.displays = [
    monitors.displays[0],
    { ...side, id: 22 },
  ]
  const { manager } = await openManager()
  expect(manager.readRecords()[0].displayId).toBe(22)
  expect(manager.readMenuEntries()[0].displayId).toBe(22)
})
