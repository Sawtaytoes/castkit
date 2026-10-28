import { expect, test } from "vitest"
import { getCompactMusicLayout } from "./compactMusicLayout.ts"

test("a wide desk card uses both queue columns rather than leaving its width empty", () => {
  const fit = getCompactMusicLayout({
    width: 969,
    height: 219,
  })
  expect(fit.isWide).toBe(true)
  expect(fit.artworkSize).toBe(144)
  expect(fit.queueColumns).toBe(2)
  expect(fit.queueCount).toBe(6)
})

test("printer competition narrows the player and leaves only complete spare rows", () => {
  const fit = getCompactMusicLayout({
    width: 308,
    height: 219,
  })
  expect(fit.isWide).toBe(false)
  expect(fit.queueColumns).toBe(1)
  expect(fit.queueCount).toBe(2)
  expect(
    getCompactMusicLayout({ width: 308, height: 177 })
      .queueCount,
  ).toBe(0)
  expect(
    getCompactMusicLayout({ width: 308, height: 178 })
      .queueCount,
  ).toBe(1)
})
