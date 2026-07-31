/**
 * Inline SVG icons.
 *
 * Emoji and symbol glyphs render as tofu on minimal kiosk OS fonts — WPE and
 * cage ship no emoji font, and a wall display showing an empty box is a
 * display that looks broken from across the room. So every mark this app draws
 * is a path it owns.
 *
 * That rule was already in `NowPlaying`, applied to the transport controls,
 * and two placeholders still spelled `♪` as text. Lifted here so the rule has
 * one home and the placeholders can obey it too — the same reasoning
 * `@charcuterie/ui` records for shipping no glyph defaults.
 */

export const ICON_PATHS = {
  previous: "M6 6h2v12H6V6zm12 0v12l-8.5-6L18 6z",
  play: "M8 5v14l11-7L8 5z",
  pause: "M6 5h4v14H6V5zm8 0h4v14h-4V5z",
  next: "M16 6h2v12h-2V6zM6 6l8.5 6L6 18V6z",
  volume:
    "M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z",
  muted:
    "M3 9v6h4l5 5V4L7 9H3zm18.6 6.7-1.4 1.4L17 13.9l-3.2 3.2-1.4-1.4 3.2-3.2-3.2-3.2 1.4-1.4L17 11.1l3.2-3.2 1.4 1.4-3.2 3.2 3.2 3.2z",
  /** Stands in for missing album art. */
  note: "M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z",
} as const

export const Icon = ({
  path,
  size = "1em",
}: {
  path: string
  size?: string
}) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="currentColor"
    aria-hidden="true"
  >
    <path d={path} />
  </svg>
)
