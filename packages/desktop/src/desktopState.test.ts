import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import {
  createWindowId,
  type DesktopState,
  defaultDesktopState,
  loadDesktopState,
  saveDesktopState,
} from "./desktopState.ts"

const temporaryDirectories: string[] = []

const createStatePath = () => {
  const directory = mkdtempSync(
    join(tmpdir(), "castkit-desktop-state-"),
  )
  temporaryDirectories.push(directory)
  return join(directory, "desktop-state.json")
}

afterEach(() => {
  temporaryDirectories.splice(0).forEach((directory) => {
    rmSync(directory, { recursive: true, force: true })
  })
})

const savedState: DesktopState = {
  version: 1,
  serverOrigin: "http://castkit.example:8788",
  windows: [
    {
      id: "window-1a2b3c4d",
      url: "http://castkit.example:8788/screen/kitchen",
      displayId: 202,
      displayLabel: "Small Monitor",
      displayBounds: {
        x: 2560,
        y: 0,
        width: 1024,
        height: 600,
      },
      windowBounds: {
        x: 2560,
        y: 0,
        width: 1024,
        height: 600,
      },
      isFullScreen: true,
      zoomByView: { "view:agenda": 1.25 },
    },
  ],
}

describe(saveDesktopState.name, () => {
  test("a saved state loads back unchanged", () => {
    const filePath = createStatePath()
    saveDesktopState({ filePath, state: savedState })
    expect(loadDesktopState(filePath)).toEqual({
      state: savedState,
      problem: null,
    })
  })

  test("no temporary file is left beside the state file", () => {
    const filePath = createStatePath()
    saveDesktopState({ filePath, state: savedState })
    saveDesktopState({
      filePath,
      state: defaultDesktopState,
    })
    expect(
      readdirSync(join(filePath, "..")).toSorted(),
    ).toEqual(["desktop-state.json"])
    expect(
      JSON.parse(readFileSync(filePath, "utf8")),
    ).toEqual(defaultDesktopState)
  })
})

describe(loadDesktopState.name, () => {
  test("a first launch starts from the defaults", () => {
    expect(loadDesktopState(createStatePath())).toEqual({
      state: defaultDesktopState,
      problem: null,
    })
  })

  test("a corrupt file falls back to the defaults and is kept aside", () => {
    const filePath = createStatePath()
    writeFileSync(
      filePath,
      '{"version": 1, "windows": [',
      "utf8",
    )
    const loaded = loadDesktopState(filePath)
    expect(loaded.state).toEqual(defaultDesktopState)
    expect(loaded.problem).toContain("could not be read")
    expect(existsSync(`${filePath}.corrupt`)).toBe(true)
    expect(existsSync(filePath)).toBe(false)
  })

  test("a file of the wrong shape falls back to the defaults", () => {
    const filePath = createStatePath()
    writeFileSync(filePath, '{"version": 7}', "utf8")
    expect(loadDesktopState(filePath).state).toEqual(
      defaultDesktopState,
    )
  })

  test("one invalid window is skipped and the others are kept", () => {
    const filePath = createStatePath()
    writeFileSync(
      filePath,
      JSON.stringify({
        ...savedState,
        windows: [
          ...savedState.windows,
          { id: "window-broken", url: 42 },
        ],
      }),
      "utf8",
    )
    expect(loadDesktopState(filePath)).toEqual({
      state: savedState,
      problem: `1 saved window(s) in ${filePath} were invalid and were skipped.`,
    })
  })
})

describe(createWindowId.name, () => {
  test("window ids are distinct and partition-safe", () => {
    const first = createWindowId()
    const second = createWindowId()
    expect(first).toMatch(/^window-[\da-f]{8}$/)
    expect(first).not.toBe(second)
  })
})
