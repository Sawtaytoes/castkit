import { describe, expect, test } from "vitest"
import {
  brightnessToPercent,
  createBrowserBacklightStore,
  parseBacklightBrightnessPayload,
  parseBacklightPercentPayload,
  percentToBrightness,
} from "./browserBacklightStore.ts"

describe("percent ↔ brightness", () => {
  test("100 % is the full 255 scale and 0 % is off", () => {
    expect(percentToBrightness(100)).toBe(255)
    expect(percentToBrightness(0)).toBe(0)
  })

  test("a percent rounds to the nearest brightness step", () => {
    expect(percentToBrightness(40)).toBe(102)
    expect(percentToBrightness(1)).toBe(3)
  })

  test("a brightness rounds to the nearest whole percent", () => {
    expect(brightnessToPercent(255)).toBe(100)
    expect(brightnessToPercent(102)).toBe(40)
    expect(brightnessToPercent(1)).toBe(0)
  })
})

describe("payload parsing", () => {
  test("accepts a whole percent inside 0–100", () => {
    expect(parseBacklightPercentPayload("0")).toBe(0)
    expect(parseBacklightPercentPayload(" 55 ")).toBe(55)
    expect(parseBacklightPercentPayload("100")).toBe(100)
  })

  test("rejects a percent outside 0–100, a fraction, or text", () => {
    expect(parseBacklightPercentPayload("101")).toBeNull()
    expect(parseBacklightPercentPayload("-1")).toBeNull()
    expect(parseBacklightPercentPayload("40.5")).toBeNull()
    expect(
      parseBacklightPercentPayload("bright"),
    ).toBeNull()
    expect(parseBacklightPercentPayload("")).toBeNull()
  })

  test("accepts a brightness inside the HA light's 0–255 scale", () => {
    expect(parseBacklightBrightnessPayload("255")).toBe(255)
    expect(
      parseBacklightBrightnessPayload("256"),
    ).toBeNull()
  })
})

describe("the store", () => {
  test("an untouched device is at 100 %", () => {
    const store = createBrowserBacklightStore()

    expect(store.getPercent("dev-square")).toBe(100)
  })

  test("a set level is read back per device", () => {
    const store = createBrowserBacklightStore()

    store.setPercent({
      deviceId: "dev-square",
      percent: 40,
    })

    expect(store.getPercent("dev-square")).toBe(40)
    expect(store.getPercent("dev-other")).toBe(100)
  })
})
