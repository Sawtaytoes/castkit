import type { LayoutSection } from "@charcuterie/logic/core"
import { selectPriorityLayout } from "@charcuterie/logic/core"
import type { JSX } from "preact"

export type CompositionItem = {
  key: string
  priority: number
  isPrinter: boolean
  aspectRatio?: number
  minimumWidth: number
  minimumHeight: number
  usageRowCount?: number
}

/** Score the composition with the same policy each media card uses internally. */
export const chooseCompositionLayout = ({
  width,
  height,
  gap,
  items,
  mode,
  measureFacts,
}: {
  width: number
  height: number
  gap: number
  items: readonly CompositionItem[]
  mode: "cards" | "rail" | "adaptive"
  measureFacts: (key: string, width: number) => number
}) => {
  const printers = items.filter((item) => item.isPrinter)
  const supporting = items.filter((item) => !item.isPrinter)
  const makeCandidate = ({
    id,
    columns,
    rows,
    cells,
  }: {
    id: "cards" | "rail"
    columns: number[]
    rows: number[]
    cells: {
      key: string
      column: number
      row: number
      columnSpan: number
      rowSpan: number
    }[]
  }) => {
    const sections: LayoutSection[] = cells.flatMap(
      (cell) => {
        const item = items.find(
          (item) => item.key === cell.key,
        )
        if (!item) return []
        const cellWidth =
          columns
            .slice(
              cell.column,
              cell.column + cell.columnSpan,
            )
            .reduce((total, value) => total + value, 0) +
          gap * (cell.columnSpan - 1)
        const cellHeight =
          rows
            .slice(cell.row, cell.row + cell.rowSpan)
            .reduce((total, value) => total + value, 0) +
          gap * (cell.rowSpan - 1)
        const minimumHeight =
          item.usageRowCount === undefined
            ? item.minimumHeight
            : 58 +
              Math.ceil(
                item.usageRowCount /
                  Math.max(
                    1,
                    Math.min(
                      3,
                      Math.floor(cellWidth / 240),
                    ),
                  ),
              ) *
                104
        const factsHeight = item.isPrinter
          ? measureFacts(item.key, cellWidth)
          : 0
        return [
          {
            priority: item.priority,
            width: cellWidth,
            height: Math.max(0, cellHeight - factsHeight),
            aspectRatio: item.aspectRatio,
            idealArea: item.isPrinter
              ? undefined
              : item.minimumWidth * item.minimumHeight * 4,
          },
          {
            priority: 0,
            width: cellWidth,
            height: cellHeight,
            minimumWidth: item.minimumWidth,
            minimumHeight: Math.max(
              minimumHeight,
              factsHeight + (item.isPrinter ? 100 : 0),
            ),
          },
        ]
      },
    )
    return {
      id,
      sections,
      style: {
        gridTemplateColumns: columns
          .map(
            (value) => `minmax(0, ${Math.max(1, value)}fr)`,
          )
          .join(" "),
        gridTemplateRows: rows
          .map(
            (value) => `minmax(0, ${Math.max(1, value)}fr)`,
          )
          .join(" "),
      } as JSX.CSSProperties,
      cells: Object.fromEntries(
        cells.map((cell) => [
          cell.key,
          {
            gridColumn: `${cell.column + 1} / span ${cell.columnSpan}`,
            gridRow: `${cell.row + 1} / span ${cell.rowSpan}`,
          } as JSX.CSSProperties,
        ]),
      ),
    }
  }
  const cardCandidates = Array.from(
    {
      length: Math.min(
        4,
        Math.max(1, printers.length, supporting.length),
      ),
    },
    (_unused, index) => index + 1,
  ).flatMap((columnCount) => {
    const printerRows = Math.ceil(
      printers.length / columnCount,
    )
    const supportRows = Math.ceil(
      supporting.length / columnCount,
    )
    const supportHeights =
      printerRows && supportRows
        ? [200, 280, 360, Math.min(440, height / 2)]
        : [height]
    return supportHeights.map((supportHeight) => {
      const rowCount = printerRows + supportRows
      const printerHeight = printerRows
        ? (height -
            gap * Math.max(0, rowCount - 1) -
            supportHeight * supportRows) /
          printerRows
        : 0
      const columns = Array.from(
        { length: columnCount },
        () =>
          (width - gap * (columnCount - 1)) / columnCount,
      )
      const rows = Array.from(
        { length: printerRows },
        () => printerHeight,
      ).concat(
        Array.from({ length: supportRows }, () =>
          printerRows
            ? supportHeight
            : (height - gap * (supportRows - 1)) /
              supportRows,
        ),
      )
      const cells = printers
        .map((item, index) => ({
          key: item.key,
          column: index % columnCount,
          row: Math.floor(index / columnCount),
          columnSpan:
            index === printers.length - 1
              ? columnCount - (index % columnCount)
              : 1,
          rowSpan: 1,
        }))
        .concat(
          supporting.map((item, index) => ({
            key: item.key,
            column: index % columnCount,
            row:
              printerRows + Math.floor(index / columnCount),
            columnSpan:
              index === supporting.length - 1
                ? columnCount - (index % columnCount)
                : 1,
            rowSpan: 1,
          })),
        )
      return makeCandidate({
        id: "cards",
        columns,
        rows,
        cells,
      })
    })
  })
  const railCandidates =
    printers.length && supporting.length
      ? [280, 340, 420, 500, width * 0.32].flatMap(
          (railWidth) => {
            const columnCounts = Array.from(
              { length: Math.min(3, printers.length) },
              (_unused, index) => index + 1,
            )
            return columnCounts.map((columnCount) => {
              const printerRows = Math.ceil(
                printers.length / columnCount,
              )
              // A common fine-grained grid lets printer and supporting groups span
              // different row counts while preserving DOM identity during reflow.
              const fineRowCount =
                printerRows * supporting.length
              const columns = Array.from(
                { length: columnCount },
                () =>
                  (width - railWidth - gap * columnCount) /
                  columnCount,
              ).concat(railWidth)
              const rows = Array.from(
                { length: fineRowCount },
                () =>
                  (height - gap * (fineRowCount - 1)) /
                  fineRowCount,
              )
              const cells = printers
                .map((item, index) => ({
                  key: item.key,
                  column: index % columnCount,
                  row:
                    Math.floor(index / columnCount) *
                    supporting.length,
                  columnSpan:
                    index === printers.length - 1
                      ? columnCount - (index % columnCount)
                      : 1,
                  rowSpan: supporting.length,
                }))
                .concat(
                  supporting.map((item, index) => ({
                    key: item.key,
                    column: columnCount,
                    row: index * printerRows,
                    columnSpan: 1,
                    rowSpan: printerRows,
                  })),
                )
              return makeCandidate({
                id: "rail",
                columns,
                rows,
                cells,
              })
            })
          },
        )
      : []
  return selectPriorityLayout(
    mode === "cards"
      ? cardCandidates
      : mode === "rail" && railCandidates.length
        ? railCandidates
        : cardCandidates.concat(railCandidates),
  )
}
