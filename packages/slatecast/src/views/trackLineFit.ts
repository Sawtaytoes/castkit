/**
 * How many rows the title, artist and album may each wrap to on the short
 * landscape panel, chosen so the whole block fits beside the art.
 *
 * The 480×320 panel lays the text out in a 224px-wide column, so a long
 * title wraps; clipping it to two rows while the artist is "Beck" wastes the
 * rows the artist did not need. The stylesheet gives each line a row count
 * through `--title-lines`, `--artist-lines` and `--album-lines`, and this pass
 * hands out the most generous counts that still fit, measured, not guessed:
 * fonts fall back and line heights differ by face, so the only honest answer
 * is the element's own height.
 *
 * Off the short panel the variables are cleared and the stylesheet's own
 * defaults apply — the square keeps its two-row title and one-row lines.
 */

/** The media query the stylesheet keys the short-panel layout on. Keep in step. */
export const SHORT_PANEL_QUERY =
  "(min-aspect-ratio: 5 / 4) and (max-height: 400px)"

/**
 * `[title, artist, album]` row counts, tried in order until the block fits.
 * The last entry is the floor: it always fits at 480×320 and is what the
 * panel showed before this pass existed (a two-row title, one-row lines).
 */
export const LINE_BUDGETS: readonly (readonly [
  number,
  number,
  number,
])[] = [
  [4, 3, 2],
  [4, 2, 2],
  [3, 2, 2],
  [3, 2, 1],
  [3, 1, 1],
  [2, 2, 1],
  [2, 1, 1],
]

const LINE_VARIABLES = [
  "--title-lines",
  "--artist-lines",
  "--album-lines",
] as const

/**
 * The vertical room the text column has: the Now Playing grid's content box
 * less the rows the seek bar and the volume row take. The art's height is
 * not the limit — the column is taller than the art, and the block is
 * centred on the art either way.
 */
const availableHeight = (track: HTMLElement) => {
  const grid = track.parentElement
  if (!grid) {
    return Number.POSITIVE_INFINITY
  }
  const gridStyle = getComputedStyle(grid)
  const padding =
    Number.parseFloat(gridStyle.paddingTop) +
    Number.parseFloat(gridStyle.paddingBottom)
  const siblingsHeight = [".seek", ".volume"].reduce(
    (total, selector) =>
      total +
      (grid.querySelector<HTMLElement>(selector)
        ?.offsetHeight ?? 0),
    0,
  )
  return grid.clientHeight - padding - siblingsHeight
}

/**
 * Set the row-count variables on `track` to the first budget whose rendered
 * height fits. Each candidate is written and then measured, which forces a
 * layout per attempt; there are at most seven, on a text change, on a panel
 * that redraws about once a second.
 */
export const fitTrackLines = (track: HTMLElement) => {
  if (!window.matchMedia(SHORT_PANEL_QUERY).matches) {
    for (const variable of LINE_VARIABLES) {
      track.style.removeProperty(variable)
    }
    return
  }
  const budget = availableHeight(track)
  for (const counts of LINE_BUDGETS) {
    LINE_VARIABLES.forEach((variable, index) => {
      track.style.setProperty(
        variable,
        String(counts[index]),
      )
    })
    if (track.offsetHeight <= budget) {
      return
    }
  }
}
