import { expect, test } from "vitest"
import {
  formatNumber,
  getDateTimeFormatter,
} from "./formatters.ts"

test("formatters reuse setup while timezone and formatting changes remain distinct", () => {
  const input = {
    locale: "en-US",
    options: {
      timeZone: "UTC",
      hour: "numeric" as const,
      minute: "2-digit" as const,
      hour12: false,
    },
  }
  const first = getDateTimeFormatter(input)
  expect(
    getDateTimeFormatter({
      ...input,
      options: { ...input.options },
    }),
  ).toBe(first)
  expect(
    first.format(new Date("2026-01-15T18:45:00Z")),
  ).toBe("18:45")
  const other = getDateTimeFormatter({
    ...input,
    options: {
      ...input.options,
      timeZone: "America/Chicago",
    },
  })
  expect(other).not.toBe(first)
  expect(
    other.format(new Date("2026-01-15T18:45:00Z")),
  ).toBe("12:45")
  expect(formatNumber(1234.5)).toBe("1,234.5")
})

test("the cache evicts old combinations rather than accumulating display settings", () => {
  const first = getDateTimeFormatter({
    locale: "en-US",
    options: {
      timeZone: "UTC",
      year: "numeric",
      era: "long",
    },
  })
  Array.from({ length: 40 }, (_, index) => {
    const hour = Math.floor(index / 4)
      .toString()
      .padStart(2, "0")
    const minute = ((index % 4) * 15)
      .toString()
      .padStart(2, "0")
    return getDateTimeFormatter({
      locale: "en-US",
      options: {
        timeZone: `+${hour}:${minute}`,
        hour: "numeric",
      },
    })
  })
  expect(
    getDateTimeFormatter({
      locale: "en-US",
      options: {
        timeZone: "UTC",
        year: "numeric",
        era: "long",
      },
    }),
  ).not.toBe(first)
})
