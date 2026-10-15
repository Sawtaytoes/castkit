import { describe, expect, test, vi } from "vitest"

vi.mock("electron", () => ({ app: {} }))

const { buildAutostartEntry, readAutostartPath } =
  await import("./launchAtLogin.ts")

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
