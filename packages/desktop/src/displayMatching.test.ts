import { describe, expect, test } from "vitest"
import {
  type DisplaySnapshot,
  matchDisplay,
  numberDisplays,
  placeWindowBounds,
} from "./displayMatching.ts"

const primaryMonitor: DisplaySnapshot = {
  id: 101,
  label: "Wide Monitor",
  bounds: { x: 0, y: 0, width: 2560, height: 1440 },
  workArea: { x: 0, y: 0, width: 2560, height: 1400 },
}

const smallMonitor: DisplaySnapshot = {
  id: 202,
  label: "Small Monitor",
  bounds: { x: 2560, y: 0, width: 1024, height: 600 },
  workArea: { x: 2560, y: 0, width: 1024, height: 600 },
}

const portraitMonitor: DisplaySnapshot = {
  id: 303,
  label: "Portrait Monitor",
  bounds: { x: -1080, y: 0, width: 1080, height: 1920 },
  workArea: { x: -1080, y: 0, width: 1080, height: 1880 },
}

const displays = [
  primaryMonitor,
  smallMonitor,
  portraitMonitor,
]

describe(matchDisplay.name, () => {
  test("an id that still exists wins", () => {
    expect(
      matchDisplay({
        displays,
        placement: {
          displayId: 202,
          displayLabel: "Small Monitor",
          displayBounds: smallMonitor.bounds,
        },
        primaryDisplayId: 101,
      }),
    ).toEqual({ display: smallMonitor, matchedBy: "id" })
  })

  test("a renumbered monitor is found by its label and bounds", () => {
    expect(
      matchDisplay({
        displays,
        placement: {
          displayId: 999,
          displayLabel: "Small Monitor",
          displayBounds: smallMonitor.bounds,
        },
        primaryDisplayId: 101,
      }),
    ).toEqual({
      display: smallMonitor,
      matchedBy: "label-and-bounds",
    })
  })

  test("a renumbered monitor that moved in the arrangement is found by label and size", () => {
    expect(
      matchDisplay({
        displays,
        placement: {
          displayId: 999,
          displayLabel: "Small Monitor",
          displayBounds: {
            x: -1024,
            y: 200,
            width: 1024,
            height: 600,
          },
        },
        primaryDisplayId: 101,
      }),
    ).toEqual({
      display: smallMonitor,
      matchedBy: "label-and-size",
    })
  })

  test("label and size do not guess between two monitors of one model", () => {
    const twinLeft: DisplaySnapshot = {
      ...smallMonitor,
      id: 1,
      bounds: { x: 0, y: 0, width: 1024, height: 600 },
    }
    const twinRight: DisplaySnapshot = {
      ...smallMonitor,
      id: 2,
      bounds: { x: 1024, y: 0, width: 1024, height: 600 },
    }
    expect(
      matchDisplay({
        displays: [twinLeft, twinRight],
        placement: {
          displayId: 999,
          displayLabel: "Small Monitor",
          displayBounds: {
            x: 5000,
            y: 0,
            width: 1024,
            height: 600,
          },
        },
        primaryDisplayId: 1,
      }),
    ).toEqual({
      display: twinLeft,
      matchedBy: "primary-fallback",
    })
  })

  test("a renamed monitor at the same bounds is found by bounds", () => {
    expect(
      matchDisplay({
        displays,
        placement: {
          displayId: 999,
          displayLabel: "Generic PnP Monitor",
          displayBounds: portraitMonitor.bounds,
        },
        primaryDisplayId: 101,
      }),
    ).toEqual({
      display: portraitMonitor,
      matchedBy: "bounds",
    })
  })

  test("a monitor that is gone falls back to the primary display", () => {
    expect(
      matchDisplay({
        displays,
        placement: {
          displayId: 999,
          displayLabel: "Unplugged Monitor",
          displayBounds: {
            x: 9000,
            y: 0,
            width: 800,
            height: 480,
          },
        },
        primaryDisplayId: 101,
      }),
    ).toEqual({
      display: primaryMonitor,
      matchedBy: "primary-fallback",
    })
  })
})

describe(placeWindowBounds.name, () => {
  test("a window keeps its bounds on an unchanged display", () => {
    expect(
      placeWindowBounds({
        placement: {
          displayBounds: smallMonitor.bounds,
          windowBounds: {
            x: 2600,
            y: 20,
            width: 800,
            height: 500,
          },
        },
        display: smallMonitor,
      }),
    ).toEqual({ x: 2600, y: 20, width: 800, height: 500 })
  })

  test("a window follows its monitor to a new position in the arrangement", () => {
    expect(
      placeWindowBounds({
        placement: {
          displayBounds: {
            x: -1024,
            y: 0,
            width: 1024,
            height: 600,
          },
          windowBounds: {
            x: -1000,
            y: 10,
            width: 600,
            height: 400,
          },
        },
        display: smallMonitor,
      }),
    ).toEqual({ x: 2584, y: 10, width: 600, height: 400 })
  })

  test("a window larger than the fallback display is shrunk to fit its work area", () => {
    expect(
      placeWindowBounds({
        placement: {
          displayBounds: primaryMonitor.bounds,
          windowBounds: {
            x: 100,
            y: 100,
            width: 2000,
            height: 1200,
          },
        },
        display: smallMonitor,
      }),
    ).toEqual({ x: 2560, y: 0, width: 1024, height: 600 })
  })
})

describe(numberDisplays.name, () => {
  test("displays are numbered left to right whatever order Electron gives", () => {
    expect(
      numberDisplays({
        displays,
        primaryDisplayId: 101,
      }).map(({ id, number, isPrimary, name }) => ({
        id,
        number,
        isPrimary,
        name,
      })),
    ).toEqual([
      {
        id: 303,
        number: 1,
        isPrimary: false,
        name: "1: Portrait Monitor (1080 x 1920)",
      },
      {
        id: 101,
        number: 2,
        isPrimary: true,
        name: "2: Wide Monitor (2560 x 1440)",
      },
      {
        id: 202,
        number: 3,
        isPrimary: false,
        name: "3: Small Monitor (1024 x 600)",
      },
    ])
  })
})
