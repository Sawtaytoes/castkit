import { expect, test } from "vitest"
import { viewAppearance } from "./platform/appearance.ts"
import "./styles.css"

const japaneseTitle = "星のピアノ"

// Chromium reports a family name with or without its CSS quotes.
const getIsJapaneseFace = (fontFace: FontFace) =>
  fontFace.family.replaceAll('"', "") === "Noto Sans JP"

const getLoadedJapaneseWeights = () =>
  [...document.fonts]
    .filter(getIsJapaneseFace)
    .filter((fontFace) => fontFace.status === "loaded")
    .map((fontFace) => fontFace.weight)

const renderText = (
  fontFamily: string,
  fontWeight: string,
) => {
  const element = document.createElement("div")
  element.style.fontFamily = fontFamily
  element.style.fontWeight = fontWeight
  element.textContent = japaneseTitle
  document.body.append(element)
  return element
}

test("Japanese text in the default stack loads Noto Sans JP", async () => {
  const element = renderText("var(--font-sans)", "600")
  await document.fonts.ready

  expect(getLoadedJapaneseWeights()).toEqual(["700"])
  element.remove()
})

test("a Japanese weight no text uses is never downloaded", async () => {
  const fontFaces = [...document.fonts].filter(
    getIsJapaneseFace,
  )

  expect(fontFaces).toHaveLength(2)
  expect(
    fontFaces.filter(
      (fontFace) => fontFace.weight === "400",
    )[0]?.status,
  ).toBe("unloaded")
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
