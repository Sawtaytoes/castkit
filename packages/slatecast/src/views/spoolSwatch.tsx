/**
 * A filament color as the panel draws it, from the spool record's `rgba`,
 * `extraColors` and `effectType`. Nothing here is guessed from a name: a
 * translucent filament is one whose alpha is below `FF`, a galaxy one is one
 * the record calls galaxy.
 *
 * A two- or three-color filament is drawn as CLIPPED VERTICAL BANDS inside the
 * rounded box, never as a gradient. A gradient bleeds under the box's
 * translucent border and reads as a smudge at the panel's size.
 */

/** The swatch sizes the screens use. `fill` takes its box from the parent. */
export type SwatchSize = "tiny" | "normal" | "big" | "fill"

/** Alpha at or above this reads as opaque and skips the checkerboard. */
const OPAQUE_ALPHA = 0xff

/**
 * An 8-digit hex color as CSS. Six digits are opaque. The result carries the
 * real alpha, so a translucent color paints its own transparency over the
 * checkerboard rather than a fixed opacity.
 */
export const parseRgba = (hex: string) => {
  const digits = hex.replace(/^#/, "")
  const red = Number.parseInt(digits.slice(0, 2), 16)
  const green = Number.parseInt(digits.slice(2, 4), 16)
  const blue = Number.parseInt(digits.slice(4, 6), 16)
  const alpha =
    digits.length >= 8
      ? Number.parseInt(digits.slice(6, 8), 16)
      : OPAQUE_ALPHA
  const isTranslucent = alpha < OPAQUE_ALPHA
  return {
    css: isTranslucent
      ? `rgb(${red} ${green} ${blue} / ${(alpha / OPAQUE_ALPHA).toFixed(2)})`
      : `rgb(${red} ${green} ${blue})`,
    isTranslucent,
  }
}

/** The effect class the swatch draws, or none for an effect it has no treatment for. */
const getEffectClass = (effectType: string | undefined) => {
  const effect = effectType?.toLowerCase() ?? ""
  return effect.includes("galaxy")
    ? " is-galaxy"
    : effect.includes("marble")
      ? " is-marble"
      : effect.includes("silk")
        ? " is-sheen"
        : ""
}

export const Swatch = ({
  rgba,
  extraColors,
  effectType,
  size = "normal",
  isHatched = false,
  isOutlined = false,
}: {
  rgba?: string
  extraColors?: readonly string[]
  effectType?: string
  size?: SwatchSize
  /** The unknown-tag placeholder: diagonal hatching, no color. */
  isHatched?: boolean
  /** The accent outline the assign step puts on an unread spool's slot. */
  isOutlined?: boolean
}) => {
  const bands = (rgba === undefined ? [] : [rgba]).concat(
    extraColors ?? [],
  )
  const parsedBands = bands.map(parseRgba)
  const hasBands = parsedBands.length > 1
  const isTranslucent = parsedBands.some(
    (band) => band.isTranslucent,
  )
  const baseColor = parsedBands[0]?.css
  const className = [
    "fss-swatch",
    `is-${size}`,
    isHatched ? "is-hatched" : "",
    isTranslucent ? "is-translucent" : "",
    isOutlined ? "is-outlined" : "",
    hasBands ? "" : getEffectClass(effectType),
  ]
    .filter(Boolean)
    .join(" ")
  return (
    <span
      class={className}
      aria-hidden="true"
      style={
        hasBands || baseColor === undefined
          ? undefined
          : { "--c": baseColor }
      }
    >
      {hasBands
        ? parsedBands.map((band, index) => (
            <span
              key={index}
              class="fss-band"
              style={{
                background: band.css,
                width: `${100 / parsedBands.length}%`,
                left: `${(100 / parsedBands.length) * index}%`,
              }}
            />
          ))
        : null}
    </span>
  )
}
