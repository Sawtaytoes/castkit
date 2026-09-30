import { describe, expect, test } from "vitest"
import { getTemporaryViewSeconds } from "./repaint.ts"

describe("getTemporaryViewSeconds", () => {
  test("an instant or fast display keeps the requested time", () => {
    expect(
      getTemporaryViewSeconds({
        repaint: "instant",
        requestedSeconds: 15,
      }),
    ).toBe(15)
    expect(
      getTemporaryViewSeconds({
        repaint: "fast",
        requestedSeconds: 15,
      }),
    ).toBe(15)
  })

  test("a slow display lengthens it to ten repaints", () => {
    expect(
      getTemporaryViewSeconds({
        repaint: "slow",
        requestedSeconds: 15,
      }),
    ).toBe(30)
  })

  test("a super-slow display refuses a temporary view", () => {
    expect(
      getTemporaryViewSeconds({
        repaint: "super-slow",
        requestedSeconds: 600,
      }),
    ).toBeUndefined()
  })
})
