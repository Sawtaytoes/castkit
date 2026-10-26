import { PANEL_FONT_FAMILY } from "@castkit/views/viewStyles"
import { createElement } from "react"
import satori from "satori"
import { expect, test, vi } from "vitest"
import { loadSatoriFonts } from "./fonts.ts"

const fontsPromise = loadSatoriFonts()
const japaneseText =
  "日本語 ひらがな カタカナ 音楽 東京 ー「」"

test.each([
  400, 700,
])("Japanese glyphs render offline at weight %s without missing-font requests", async (weight) => {
  const fonts = await fontsPromise
  const missingAsset = vi.fn(async () => [])
  const element = createElement(
    "div",
    {
      style: {
        fontFamily: PANEL_FONT_FAMILY,
        fontWeight: weight,
        fontSize: 20,
      },
    },
    japaneseText,
  )
  await satori(element, {
    width: 800,
    height: 60,
    fonts,
    loadAdditionalAsset: missingAsset,
  })
  expect(missingAsset).not.toHaveBeenCalled()

  // Prove the check catches the original regression, rather than accepting tofu.
  await satori(element, {
    width: 800,
    height: 60,
    fonts: fonts.filter(
      (font) => font.name !== "Noto Sans JP",
    ),
    loadAdditionalAsset: missingAsset,
  })
  expect(missingAsset).toHaveBeenCalled()
})

test("adding Japanese fallback preserves existing Latin glyph outlines and layout", async () => {
  const fonts = await fontsPromise
  const element = createElement(
    "div",
    {
      style: {
        fontFamily: PANEL_FONT_FAMILY,
        fontSize: 20,
        fontWeight: 700,
      },
    },
    "Now Playing 12:34",
  )
  const withFallback = await satori(element, {
    width: 300,
    height: 50,
    fonts,
  })
  const withoutFallback = await satori(element, {
    width: 300,
    height: 50,
    fonts: fonts.filter(
      (font) => font.name !== "Noto Sans JP",
    ),
  })
  // Exact vector equality verifies the existing panel face still wins.
  expect(withFallback).toBe(withoutFallback)
})
