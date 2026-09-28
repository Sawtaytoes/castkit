import { expect, test } from "vitest"
import { filamentColorName } from "./filamentColorName.ts"

test.each([
  ["#000000", "Black"],
  ["#ffffff", "White"],
  ["#d1d3d5", "Light Gray"],
  ["#9b9ea0", "Gray"],
  ["#3f8e43", "Green"],
  ["#00ae42", "Green"],
  ["#f4ee2a", "Yellow"],
  ["#ff9016", "Orange"],
  ["#009fa1", "Teal"],
  ["#307fe2", "Blue"],
  ["#e94b3c", "Red"],
  ["#e7ceb5", "Beige"],
  ["#6b3e1e", "Brown"],
  ["#f5a3c0", "Pink"],
  ["#7b3fbf", "Purple"],
  ["3F8E43FF", "Green"],
])("%s reads as %s", (color, name) => {
  expect(filamentColorName(color)).toBe(name)
})

test("an absent or malformed color has no name", () => {
  expect(filamentColorName(undefined)).toBeUndefined()
  expect(filamentColorName("green")).toBeUndefined()
})
