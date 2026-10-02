import { selectPriorityLayout } from "@charcuterie/logic/core"
import type { selectProviderRows } from "./aiUsageRows.ts"

type ProviderRows = ReturnType<
  typeof selectProviderRows
>[number]

/**
 * Row heights at scale 1, in pixels. The stylesheet multiplies the same
 * numbers by `--ai-usage-scale`, so the arithmetic here and the glass agree.
 *
 * ⚠️ These are a contract with `platform.css`, not a preference. A row drawn
 * one pixel taller than the budget believes leaves the last row cut in half,
 * and a panel has no scrollbar to reveal the rest.
 */
export const BASE_VIEW_HEADING_HEIGHT = 58
export const BASE_PROVIDER_HEADING_HEIGHT = 34
export const BASE_ROW_HEIGHT = 70

/**
 * The panel height at which the type is drawn at scale 1. Below it nothing
 * shrinks — a 122 px pHAT is already at the floor. Above it the type grows
 * with the glass until `MAX_SCALE`, so a 480 px letterbox on a desk and a
 * 1200 px panel across a room both read at their distance.
 */
const SCALE_REFERENCE_HEIGHT = 280
const MAX_SCALE = 2

/**
 * A column narrower than this at scale 1 cannot hold a label and a percentage
 * on one line: "Weekly (all models)" at 15 px is about 150 px, "28% left" at
 * 17 px bold about 55 px, and the gap between them 12 px.
 */
const MIN_COLUMN_WIDTH = 220
const MAX_COLUMN_COUNT = 3
/** How much wider than tall a panel must be per extra column. */
const COLUMN_ASPECT = 1.1

const clamp = ({
  value,
  minimum,
  maximum,
}: {
  value: number
  minimum: number
  maximum: number
}) => Math.min(maximum, Math.max(minimum, value))

/** How much larger than scale 1 the type is drawn on a panel this tall. */
export const getTypeScale = (panelHeight: number) =>
  clamp({
    value: panelHeight / SCALE_REFERENCE_HEIGHT,
    minimum: 1,
    maximum: MAX_SCALE,
  })

/**
 * How many columns the sections flow into.
 *
 * A letterbox panel is the case one column gets wrong: at 1360 x 480 a single
 * column puts a forty-character label beside twelve hundred pixels of white
 * and still runs out of height after three providers. The count comes from
 * the panel's own aspect, then is held to what the width can actually carry
 * at this type size — which is what keeps a 250 x 122 pHAT, wider than tall
 * by the same ratio, at one column.
 */
export const getColumnCount = ({
  width,
  height,
  scale,
}: {
  width: number
  height: number
  scale: number
}) => {
  if (width <= 0 || height <= 0) {
    return 1
  }
  const byAspect = Math.round(
    width / height / COLUMN_ASPECT,
  )
  const byWidth = Math.floor(
    width / (MIN_COLUMN_WIDTH * scale),
  )
  return clamp({
    value: Math.min(byAspect, byWidth),
    minimum: 1,
    maximum: MAX_COLUMN_COUNT,
  })
}

export type PlacedSection = {
  provider: ProviderRows["provider"]
  rows: ProviderRows["rows"]
}

/**
 * Where each provider's section lands, given the glass.
 *
 * Sections fill columns first to last and never split across two. A section
 * that does not wholly fit the current column moves to the next one rather
 * than losing rows to a break, so a trimmed section only ever appears in the
 * last column that had any room. Rows the layout drops are counted, because
 * "did not fit" is the one thing the reader must be told; rows the selection
 * rule withheld were never handed to this function and are not.
 */
const placeAtScale = ({
  providerRows,
  width,
  height,
  scale,
  columnCount,
}: {
  scale: number
  columnCount: number
  providerRows: readonly ProviderRows[]
  /** The panel's content box, before the view heading is taken. */
  width: number
  height: number
}) => {
  const columnHeight =
    height - BASE_VIEW_HEADING_HEIGHT * scale
  const providerHeadingHeight =
    BASE_PROVIDER_HEADING_HEIGHT * scale
  const rowHeight = BASE_ROW_HEIGHT * scale

  const placed = providerRows.reduce<{
    columns: PlacedSection[][]
    columnIndex: number
    heightLeft: number
    shownRowCount: number
  }>(
    (accumulated, entry) => {
      if (entry.rows.length === 0) {
        return accumulated
      }
      const fullHeight =
        providerHeadingHeight +
        entry.rows.length * rowHeight
      const hasNextColumn =
        accumulated.columnIndex < columnCount - 1
      /*
       * Moving to a fresh column only helps when this one has been partly
       * spent. A section too tall for an EMPTY column is too tall for every
       * column, and skipping ahead would waste the one it is standing in.
       */
      const isCurrentColumnSpent =
        accumulated.heightLeft < columnHeight
      const isMoving =
        fullHeight > accumulated.heightLeft &&
        hasNextColumn &&
        isCurrentColumnSpent
      const columnIndex = isMoving
        ? accumulated.columnIndex + 1
        : accumulated.columnIndex
      const heightLeft = isMoving
        ? columnHeight
        : accumulated.heightLeft
      const rowCount = clamp({
        value: Math.floor(
          (heightLeft - providerHeadingHeight) / rowHeight,
        ),
        minimum: 0,
        maximum: entry.rows.length,
      })
      if (rowCount === 0) {
        return {
          columns: accumulated.columns,
          columnIndex,
          heightLeft,
          shownRowCount: accumulated.shownRowCount,
        }
      }
      const section = {
        provider: entry.provider,
        rows: entry.rows.slice(0, rowCount),
      }
      return {
        columns: accumulated.columns.map((column, index) =>
          index === columnIndex
            ? column.concat([section])
            : column,
        ),
        columnIndex,
        heightLeft:
          heightLeft -
          providerHeadingHeight -
          rowCount * rowHeight,
        shownRowCount: accumulated.shownRowCount + rowCount,
      }
    },
    {
      columns: Array.from(
        { length: columnCount },
        () => [],
      ),
      columnIndex: 0,
      heightLeft: columnHeight,
      shownRowCount: 0,
    },
  )
  const totalRowCount = providerRows.reduce(
    (total, entry) => total + entry.rows.length,
    0,
  )
  return {
    scale,
    columnCount,
    columns: placed.columns.filter(
      (column) => column.length > 0,
    ),
    hiddenRowCount: totalRowCount - placed.shownRowCount,
  }
}

/** Keep every selected quota readable, then grow type within its allocated panel. */
export const placeSections = ({
  providerRows,
  width,
  height,
  isAdaptive = false,
}: {
  providerRows: readonly ProviderRows[]
  width: number
  height: number
  isAdaptive?: boolean
}) => {
  const scale = getTypeScale(height)
  if (!isAdaptive)
    return placeAtScale({
      providerRows,
      width,
      height,
      scale,
      columnCount: getColumnCount({ width, height, scale }),
    })
  const candidates = [1, 2, 3].flatMap((columnCount) =>
    Array.from(
      { length: 11 },
      (_unused, index) => 1 + index / 10,
    ).map((scale) => {
      const result = placeAtScale({
        providerRows,
        width,
        height,
        scale,
        columnCount,
      })
      return {
        id: `${columnCount}:${scale}`,
        result,
        sections: [
          {
            priority: 2,
            width:
              providerRows.reduce(
                (count, entry) => count + entry.rows.length,
                0,
              ) - result.hiddenRowCount,
            height: 1,
          },
          { priority: 1, width: scale * 100, height: 1 },
          {
            priority: 0,
            width: width / columnCount,
            height: Math.max(0, height),
            minimumWidth: MIN_COLUMN_WIDTH * scale,
          },
        ],
      }
    }),
  )
  return (
    selectPriorityLayout(candidates)?.result ??
    placeAtScale({
      providerRows,
      width,
      height,
      scale: 1,
      columnCount: 1,
    })
  )
}
