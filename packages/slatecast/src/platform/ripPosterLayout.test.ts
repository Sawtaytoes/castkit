import { expect, test } from "vitest"
import { chooseRipPosterLayout } from "./ripPosterLayout.ts"

test.each([
  1, 2, 3,
])("a 480 × 320 panel can keep posters for %s rips", (count) => {
  expect(
    chooseRipPosterLayout({
      width: 454,
      height: 294,
      count,
      isPosterRequested: true,
    })?.id,
  ).toBe("posters")
})
test("posters disappear before nine active jobs are dropped", () => {
  expect(
    chooseRipPosterLayout({
      width: 454,
      height: 294,
      count: 9,
      isPosterRequested: true,
    })?.id,
  ).toBe("rows")
})
test("an ordinary row can add artwork when its measured space permits", () => {
  expect(
    chooseRipPosterLayout({
      width: 454,
      height: 294,
      count: 2,
      isPosterRequested: false,
    })?.id,
  ).toBe("row-posters")
  expect(
    chooseRipPosterLayout({
      width: 454,
      height: 150,
      count: 3,
      isPosterRequested: false,
    })?.id,
  ).toBe("rows")
})
