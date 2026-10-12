import { describe, expect, test } from "vitest"
import {
  clampZoomFactor,
  readZoomFactor,
  resolveViewKey,
  stepZoomFactor,
  writeZoomFactor,
} from "./zoomByView.ts"

describe(stepZoomFactor.name, () => {
  test("zooming in from 100% moves to 110%", () => {
    expect(
      stepZoomFactor({ factor: 1, direction: "in" }),
    ).toBe(1.1)
  })

  test("zooming out from 100% moves to 90%", () => {
    expect(
      stepZoomFactor({ factor: 1, direction: "out" }),
    ).toBe(0.9)
  })

  test("a factor between steps moves to the nearest step on that side", () => {
    expect(
      stepZoomFactor({ factor: 1.3, direction: "in" }),
    ).toBe(1.5)
    expect(
      stepZoomFactor({ factor: 1.3, direction: "out" }),
    ).toBe(1.25)
  })

  test("the ladder stops at both ends", () => {
    expect(
      stepZoomFactor({ factor: 5, direction: "in" }),
    ).toBe(5)
    expect(
      stepZoomFactor({ factor: 0.25, direction: "out" }),
    ).toBe(0.25)
  })
})

describe(writeZoomFactor.name, () => {
  test("each view keeps its own factor", () => {
    const afterClock = writeZoomFactor({
      zoomByView: {},
      viewKey: "view:clock",
      factor: 1.5,
    })
    const afterAgenda = writeZoomFactor({
      zoomByView: afterClock,
      viewKey: "view:agenda",
      factor: 0.8,
    })
    expect(afterAgenda).toEqual({
      "view:clock": 1.5,
      "view:agenda": 0.8,
    })
    expect(
      readZoomFactor({
        zoomByView: afterAgenda,
        viewKey: "view:clock",
      }),
    ).toBe(1.5)
  })

  test("resetting to 100% removes the entry", () => {
    expect(
      writeZoomFactor({
        zoomByView: {
          "view:clock": 1.5,
          "view:agenda": 0.8,
        },
        viewKey: "view:clock",
        factor: 1,
      }),
    ).toEqual({ "view:agenda": 0.8 })
  })

  test("the input map is not changed", () => {
    const zoomByView = { "view:clock": 1.5 }
    writeZoomFactor({
      zoomByView,
      viewKey: "view:clock",
      factor: 2,
    })
    expect(zoomByView).toEqual({ "view:clock": 1.5 })
  })
})

describe(readZoomFactor.name, () => {
  test("a view never zoomed shows at 100%", () => {
    expect(
      readZoomFactor({
        zoomByView: { "view:clock": 1.5 },
        viewKey: "view:agenda",
      }),
    ).toBe(1)
  })
})

describe(clampZoomFactor.name, () => {
  test("an out-of-range or broken factor is pulled back into range", () => {
    expect(clampZoomFactor(40)).toBe(5)
    expect(clampZoomFactor(0)).toBe(0.25)
    expect(clampZoomFactor(Number.NaN)).toBe(1)
  })
})

describe(resolveViewKey.name, () => {
  test("the view the page reports is the key", () => {
    expect(
      resolveViewKey({
        reportedView: "agenda",
        url: "http://castkit.example:8788/screen/kitchen",
      }),
    ).toBe("view:agenda")
  })

  test("the path stands in until the page reports a view", () => {
    expect(
      resolveViewKey({
        reportedView: null,
        url: "http://castkit.example:8788/screen/kitchen",
      }),
    ).toBe("path:/screen/kitchen")
  })
})
