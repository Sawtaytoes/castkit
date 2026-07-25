import { describe, expect, test } from "vitest"
import { formatTime } from "./formatTime.ts"

describe("formatTime", () => {
  test("renders a sub-minute position with a zero minute", () => {
    expect(formatTime(9)).toBe("0:09")
  })

  test("zero-pads a seconds value below ten", () => {
    expect(formatTime(65)).toBe("1:05")
  })

  test("rolls seconds over into minutes", () => {
    expect(formatTime(151)).toBe("2:31")
  })

  test("keeps counting in minutes past an hour", () => {
    expect(formatTime(3_661)).toBe("61:01")
  })

  test("clamps a negative position to zero", () => {
    expect(formatTime(-4.2)).toBe("0:00")
  })

  test("floors a fractional second instead of rounding it up", () => {
    expect(formatTime(59.99)).toBe("0:59")
  })
})
