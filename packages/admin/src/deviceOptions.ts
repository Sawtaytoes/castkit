export const IMAGE_COLOR_OPTIONS = [
  { label: "Mono", value: "monochrome" },
  { label: "Grayscale (16 levels)", value: "grayscale" },
  { label: "Spectra 6", value: "spectra6" },
]
export const BROWSER_COLOR_OPTIONS = [
  { label: "Full color", value: "full" },
  { label: "Grayscale", value: "grayscale" },
  { label: "Mono", value: "monochrome" },
  { label: "Spectra 6", value: "spectra6" },
]
export const ROTATION_OPTIONS = [0, 90, 180, 270].map(
  (value) => ({
    label: `${value}°`,
    value: String(value),
  }),
)
export const SHAPE_OPTIONS = [
  "rectangle",
  "square",
  "round",
].map((value) => ({
  label: value[0]?.toUpperCase() + value.slice(1),
  value,
}))
export const DITHER_OPTIONS = [
  "floyd-steinberg",
  "atkinson",
  "ordered",
  "off",
  "threshold",
  "stucki",
  "sierra",
].map((value) => ({ label: value, value }))
export const PHOTO_FORMAT_OPTIONS = [
  "Auto",
  "JPEG",
  "WebP",
  "PNG",
].map((value) => ({ label: value, value }))
export const TIME_FORMAT_OPTIONS = [
  "Auto",
  "12-hour",
  "24-hour",
].map((value) => ({ label: value, value }))
export const DATE_STYLE_OPTIONS = [
  "Auto",
  "Long",
  "Numeric",
].map((value) => ({ label: value, value }))
export const COLOR_MODE_OPTIONS = [
  "Color",
  "Black & White",
].map((value) => ({ label: value, value }))
