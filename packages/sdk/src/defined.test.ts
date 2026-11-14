import { expect, test } from "vitest"
import { defined } from "./defined.ts"

test("defined returns a present value unchanged, including falsy ones", () => {
  const record = { name: "panel" }
  expect(defined(record)).toBe(record)
  expect(defined(0)).toBe(0)
  expect(defined("")).toBe("")
  expect(defined(false)).toBe(false)
})

test("defined throws a named error for null and undefined", () => {
  expect(() => defined(null)).toThrow(
    "Expected a value, but it was null",
  )
  expect(() => defined(undefined)).toThrow(
    "Expected a value, but it was undefined",
  )
})
