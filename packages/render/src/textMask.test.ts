import { expect, test } from "vitest"
import { renderTextMask } from "./textMask.ts"

const coveredColumns = (
  mask: ReturnType<typeof renderTextMask>,
) =>
  Array.from({ length: mask.width }).filter((_, column) =>
    Array.from({ length: mask.height }).some(
      (_, row) =>
        (mask.coverage[row * mask.width + column] ?? 0) > 0,
    ),
  ).length

test("text renders as a coverage mask in the panel face, with the background left empty", () => {
  const mask = renderTextMask({
    text: "Front 12:34",
    width: 200,
    height: 40,
    fontSize: 24,
  })
  expect(mask.coverage.length).toBe(200 * 40)
  expect(coveredColumns(mask)).toBeGreaterThan(40)
  expect(mask.coverage[0]).toBe(0)
  expect(Math.max(...mask.coverage)).toBe(255)
})

test("end-aligned text sits against the right edge", () => {
  const mask = renderTextMask({
    text: "Live",
    width: 200,
    height: 40,
    fontSize: 24,
    align: "end",
  })
  const hasLeftHalfInk = Array.from({ length: 40 }).some(
    (_, row) =>
      mask.coverage
        .subarray(row * 200, row * 200 + 100)
        .some((value) => value > 0),
  )
  expect(hasLeftHalfInk).toBe(false)
  expect(coveredColumns(mask)).toBeGreaterThan(20)
})
