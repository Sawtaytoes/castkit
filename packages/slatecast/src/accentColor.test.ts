import { describe, expect, test } from "vitest"
import { clampAccentToScheme } from "./accentColor.ts"

const toLinear = (channel: number) => {
  const scaled = channel / 255
  return scaled <= 0.03928
    ? scaled / 12.92
    : ((scaled + 0.055) / 1.055) ** 2.4
}

const parseChannels = (color: string) => {
  const [red = 0, green = 0, blue = 0] = (
    color.match(/\d+(?:\.\d+)?/g) ?? []
  )
    .slice(0, 3)
    .map(Number)
  return { red, green, blue }
}

const luminanceOf = (color: string) => {
  const { red, green, blue } = parseChannels(color)
  return (
    0.2126 * toLinear(red) +
    0.7152 * toLinear(green) +
    0.0722 * toLinear(blue)
  )
}

const contrastAgainst = (
  color: string,
  surfaceLuminance: number,
) => {
  const [lighter = 0, darker = 0] = [
    luminanceOf(color),
    surfaceLuminance,
  ].sort((first, second) => second - first)
  return (lighter + 0.05) / (darker + 0.05)
}

/** `--color-surface-raised`, the surface an agenda row / track line sits on. */
const DARK_SURFACE_LUMINANCE = 0.0174
const LIGHT_SURFACE_LUMINANCE = 1

const hueOf = (color: string) => {
  const parsed = parseChannels(color)
  const red = parsed.red / 255
  const green = parsed.green / 255
  const blue = parsed.blue / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min
  if (delta === 0) {
    return null
  }
  const raw =
    max === red
      ? ((green - blue) / delta) % 6
      : max === green
        ? (blue - red) / delta + 2
        : (red - green) / delta + 4
  return (raw * 60 + 360) % 360
}

/**
 * Album art votes on hue and knows nothing about the panel's scheme. With the
 * panels defaulting to Dark, a cover whose dominant color is a deep navy would
 * paint the artist line and the progress fill nearly invisible.
 */
describe("clamping a derived accent to the scheme", () => {
  test("a deep navy is lifted until it clears 4.5:1 on dark", () => {
    const clamped = clampAccentToScheme({
      color: "rgb(20 24 90)",
      isDarkScheme: true,
    })

    expect(
      contrastAgainst(clamped, DARK_SURFACE_LUMINANCE),
    ).toBeGreaterThanOrEqual(4.5)
  })

  test("a near-black is lifted rather than left invisible", () => {
    const clamped = clampAccentToScheme({
      color: "rgb(8 8 10)",
      isDarkScheme: true,
    })

    expect(
      contrastAgainst(clamped, DARK_SURFACE_LUMINANCE),
    ).toBeGreaterThanOrEqual(4.5)
  })

  test("a pale yellow is darkened until it clears 4.5:1 on light", () => {
    const clamped = clampAccentToScheme({
      color: "rgb(250 240 140)",
      isDarkScheme: false,
    })

    expect(
      contrastAgainst(clamped, LIGHT_SURFACE_LUMINANCE),
    ).toBeGreaterThanOrEqual(4.5)
  })

  test("a color that already clears the floor is returned untouched", () => {
    const clamped = clampAccentToScheme({
      color: "rgb(174 182 247)",
      isDarkScheme: true,
    })

    expect(clamped).toBe("rgb(174 182 247)")
  })

  test("the artwork's hue survives the blend", () => {
    const before = "rgb(20 24 90)"
    const after = clampAccentToScheme({
      color: before,
      isDarkScheme: true,
    })

    expect(hueOf(after)).toBeCloseTo(hueOf(before) ?? 0, 0)
  })

  test("an unparseable color is passed through rather than guessed at", () => {
    expect(
      clampAccentToScheme({
        color: "not-a-color",
        isDarkScheme: true,
      }),
    ).toBe("not-a-color")
  })
})
