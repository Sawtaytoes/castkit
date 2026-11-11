import { expect, test } from "vitest"
import { viewAppearance } from "./platform/appearance.ts"
import "./styles.css"

// Chromium reports a family name with or without its CSS quotes.
const getJapaneseFaces = () =>
  [...document.fonts].filter(
    (fontFace) =>
      fontFace.family.replaceAll('"', "") ===
      "Noto Sans JP",
  )

const getLoadedJapaneseFaces = () =>
  getJapaneseFaces()
    .filter((fontFace) => fontFace.status === "loaded")
    .map(
      (fontFace) =>
        `${fontFace.weight} ${fontFace.unicodeRange.includes("U+4E00") ? "kanji" : "kana"}`,
    )

const renderText = (text: string) => {
  const element = document.createElement("div")
  element.style.fontFamily = "var(--font-sans)"
  element.style.fontWeight = "600"
  element.textContent = text
  document.body.append(element)
  return element
}

const getTextWidth = (fontFamily: string, text: string) => {
  const context = document
    .createElement("canvas")
    .getContext("2d")
  if (!context) {
    throw new Error("no 2d context")
  }
  context.font = `700 40px ${fontFamily}`
  return context.measureText(text).width
}

// One test, because `document.fonts` is shared and a face never unloads:
// each step depends on what the earlier steps did and did not download.
test("Japanese text downloads only the Noto Sans JP slices it uses", async () => {
  expect(getJapaneseFaces()).toHaveLength(4)

  const latin = renderText(
    "Super Mario Galaxy 2 Original Soundtrack",
  )
  await document.fonts.ready
  expect(getLoadedJapaneseFaces()).toEqual([])

  const kana = renderText("ロゼッタのテーマ")
  await document.fonts.ready
  expect(getLoadedJapaneseFaces()).toEqual(["700 kana"])

  const kanji = renderText("星の子チコ")
  await document.fonts.ready
  expect(getLoadedJapaneseFaces().sort()).toEqual([
    "700 kana",
    "700 kanji",
  ])

  // The stack draws these characters with Noto Sans JP itself, not with a
  // system fallback or missing-glyph boxes.
  expect(getTextWidth('"Noto Sans JP"', "星の子チコ")).toBe(
    getTextWidth(
      'Outfit, "Noto Sans JP", sans-serif',
      "星の子チコ",
    ),
  )

  for (const element of [latin, kana, kanji]) {
    element.remove()
  }
})

test("a view's own font family keeps the Japanese fallback", () => {
  expect(
    viewAppearance({
      appearance: { fontFamily: "Georgia, serif" },
    } as Parameters<typeof viewAppearance>[0])[
      "--font-sans"
    ],
  ).toBe('Georgia, serif, "Noto Sans JP"')
  expect(
    viewAppearance({ appearance: {} } as Parameters<
      typeof viewAppearance
    >[0])["--font-sans"],
  ).toBeUndefined()
})
