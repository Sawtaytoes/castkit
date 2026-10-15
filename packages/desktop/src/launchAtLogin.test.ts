import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest"

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  getLoginItemSettings: vi.fn(),
  setLoginItemSettings: vi.fn(),
}))

vi.mock("node:fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs")>()),
  existsSync: mocks.existsSync,
}))
vi.mock("electron", () => ({
  app: {
    getLoginItemSettings: mocks.getLoginItemSettings,
    setLoginItemSettings: mocks.setLoginItemSettings,
  },
}))

const {
  buildAutostartEntry,
  readAutostartPath,
  readLaunchAtLogin,
  writeLaunchAtLogin,
  migrateLaunchAtLogin,
} = await import("./launchAtLogin.ts")

describe(readAutostartPath.name, () => {
  test("uses XDG_CONFIG_HOME when it is set", () => {
    expect(
      readAutostartPath({
        configHome: "/home/someone/.local/config",
        home: "/home/someone",
      }),
    ).toBe(
      "/home/someone/.local/config/autostart/castkit.desktop",
    )
  })

  test("falls back to ~/.config", () => {
    expect(
      readAutostartPath({
        configHome: undefined,
        home: "/home/someone",
      }),
    ).toBe(
      "/home/someone/.config/autostart/castkit.desktop",
    )
  })
})

describe(buildAutostartEntry.name, () => {
  test("starts the running executable, quoted so a space survives", () => {
    const entry = buildAutostartEntry(
      "/home/someone/Apps/CastKit linux/CastKit",
    )
    expect(entry.split("\n")).toEqual([
      "[Desktop Entry]",
      "Type=Application",
      "Name=CastKit",
      "Comment=Show CastKit pages in windows on your displays",
      'Exec="/home/someone/Apps/CastKit linux/CastKit"',
      "Terminal=false",
      "X-GNOME-Autostart-enabled=true",
      "",
    ])
  })
})

const executablePath =
  "C:\\Users\\Example User\\AppData\\Local\\castkit\\app-1.2.3\\CastKit.exe"
const launcherPath =
  "C:\\Users\\Example User\\AppData\\Local\\castkit\\CastKit.exe"
const updaterPath =
  "C:\\Users\\Example User\\AppData\\Local\\castkit\\Update.exe"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.existsSync.mockReturnValue(true)
  vi.stubGlobal("process", {
    ...process,
    platform: "win32",
    execPath: executablePath,
  })
})

afterEach(() => vi.unstubAllGlobals())

test("an installed Windows app registers the stable launcher with no quoted arguments", () => {
  writeLaunchAtLogin(true)
  expect(mocks.setLoginItemSettings).toHaveBeenCalledWith({
    path: launcherPath,
    args: [],
    openAtLogin: true,
    enabled: true,
  })
})

test("a portable Windows app uses Electron's running-executable default", () => {
  mocks.existsSync.mockReturnValue(false)
  writeLaunchAtLogin(true)
  expect(mocks.setLoginItemSettings).toHaveBeenCalledWith({
    openAtLogin: true,
    enabled: true,
  })
})

test.each([
  true,
  false,
])("Windows approval %s controls the checkbox even when a Run entry exists", (isEnabled) => {
  mocks.getLoginItemSettings.mockReturnValue({
    openAtLogin: true,
    executableWillLaunchAtLogin: isEnabled,
  })
  expect(readLaunchAtLogin()).toBe(isEnabled)
  expect(mocks.getLoginItemSettings).toHaveBeenCalledWith({
    path: launcherPath,
    args: [],
  })
})

test("turning launch at login off removes and disables the same Windows entry", () => {
  writeLaunchAtLogin(false)
  expect(mocks.setLoginItemSettings).toHaveBeenCalledWith({
    path: launcherPath,
    args: [],
    openAtLogin: false,
    enabled: false,
  })
})

test.each([
  true,
  false,
])("migrating the broken updater command preserves Windows approval %s", (isEnabled) => {
  mocks.getLoginItemSettings.mockReturnValue({
    openAtLogin: true,
    executableWillLaunchAtLogin: isEnabled,
  })
  migrateLaunchAtLogin()
  expect(mocks.getLoginItemSettings).toHaveBeenCalledWith({
    path: updaterPath,
    args: ["--processStart", '"CastKit.exe"'],
  })
  expect(mocks.setLoginItemSettings).toHaveBeenCalledWith({
    path: launcherPath,
    args: [],
    openAtLogin: true,
    enabled: isEnabled,
  })
})

test("an install without the old entry does not enable launch at login", () => {
  mocks.getLoginItemSettings.mockReturnValue({
    openAtLogin: false,
  })
  migrateLaunchAtLogin()
  expect(mocks.setLoginItemSettings).not.toHaveBeenCalled()
})

test("macOS keeps Electron's native login item behavior", () => {
  vi.stubGlobal("process", {
    ...process,
    platform: "darwin",
  })
  mocks.getLoginItemSettings.mockReturnValue({
    openAtLogin: true,
  })
  expect(readLaunchAtLogin()).toBe(true)
  writeLaunchAtLogin(true)
  migrateLaunchAtLogin()
  expect(
    mocks.setLoginItemSettings,
  ).toHaveBeenCalledExactlyOnceWith({ openAtLogin: true })
})
