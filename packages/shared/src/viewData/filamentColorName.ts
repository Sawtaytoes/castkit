/**
 * A plain English word for a filament swatch, for when the source knows the
 * hex value but not the maker's color name. A swatch alone is not enough:
 * two dark filaments read the same at arm's length, and a person looking for
 * the spool to load thinks "the green one", not "#3f8e43".
 *
 * The buckets are deliberately coarse — "Green", "Light Gray", "Beige" — so
 * the word is never more specific than the eye can confirm against the spool.
 */
export const filamentColorName = (
  color: string | undefined,
): string | undefined => {
  const match = /^#?([0-9a-f]{6})/i.exec(color ?? "")
  if (!match) {
    return undefined
  }
  const [red, green, blue] = [0, 2, 4].map(
    (offset) =>
      Number.parseInt(
        match[1].slice(offset, offset + 2),
        16,
      ) / 255,
  )
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const chroma = max - min
  const lightness = (max + min) / 2
  const saturation =
    chroma === 0
      ? 0
      : chroma / (1 - Math.abs(2 * lightness - 1))

  if (lightness < 0.12) {
    return "Black"
  }
  if (saturation < 0.15 || chroma < 0.08) {
    if (lightness > 0.9) return "White"
    if (lightness > 0.7) return "Light Gray"
    if (lightness < 0.3) return "Dark Gray"
    return "Gray"
  }

  const hue =
    max === red
      ? (((green - blue) / chroma) % 6) * 60
      : max === green
        ? ((blue - red) / chroma + 2) * 60
        : ((red - green) / chroma + 4) * 60
  const degrees = (hue + 360) % 360

  if (degrees >= 15 && degrees < 50) {
    if (lightness > 0.72) return "Beige"
    if (lightness < 0.45) return "Brown"
  }
  if (
    (degrees >= 330 || degrees < 15) &&
    lightness > 0.72
  ) {
    return "Pink"
  }

  const hueName =
    degrees < 15
      ? "Red"
      : degrees < 45
        ? "Orange"
        : degrees < 70
          ? "Yellow"
          : degrees < 165
            ? "Green"
            : degrees < 195
              ? "Teal"
              : degrees < 255
                ? "Blue"
                : degrees < 290
                  ? "Purple"
                  : degrees < 330
                    ? "Pink"
                    : "Red"
  if (lightness > 0.75) return `Light ${hueName}`
  if (lightness < 0.25) return `Dark ${hueName}`
  return hueName
}
