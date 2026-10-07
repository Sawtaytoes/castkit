import type { LayoutSection } from "@charcuterie/logic/core"
import { selectPriorityLayout } from "@charcuterie/logic/core"
import type { JSX } from "preact"
import {
  BASE_PROVIDER_HEADING_HEIGHT,
  BASE_ROW_HEIGHT,
  placeSections,
} from "./aiUsageLayout.ts"
import type { selectProviderRows } from "./aiUsageRows.ts"
import type { PrinterDetailLevel } from "./printerContentFit.ts"

export type CompositionItem = {
  key: string
  priority: number
  isPrinter: boolean
  aspectRatio?: number
  minimumWidth: number
  minimumHeight: number
  usageRows?: ReturnType<typeof selectProviderRows>
  insetWidth?: number
  insetHeight?: number
}

// Providers stay together, so a row count divided by columns is not a fit budget.
const usageHeight = (
  item: CompositionItem,
  width: number,
) => {
  const entries = item.usageRows ?? []
  const heights = entries.map(
    (entry) =>
      (BASE_PROVIDER_HEADING_HEIGHT +
        entry.rows.length * BASE_ROW_HEIGHT) *
      0.65,
  )
  const candidates = heights
    .flatMap((_height, index) =>
      heights
        .slice(index)
        .map((_height, length) =>
          heights
            .slice(index, index + length + 1)
            .reduce((total, height) => total + height, 0),
        ),
    )
    .sort((first, second) => first - second)
  return (
    (candidates.find(
      (height) =>
        placeSections({
          providerRows: entries,
          width: Math.max(
            0,
            width - (item.insetWidth ?? 0),
          ),
          height,
          isAdaptive: true,
          minimumScale: 0.65,
          hasViewHeading: false,
        }).hiddenRowCount === 0,
    ) ?? item.minimumHeight) + (item.insetHeight ?? 0)
  )
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
  measureFacts: (
    key: string,
    width: number,
    detailLevel?: PrinterDetailLevel,
  ) => number
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
  }) =>
    ([0, 1, 2, 3] as const).map((detailLevel) => {
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
          const contentWidth = Math.max(
            0,
            cellWidth - (item.insetWidth ?? 0),
          )
          const minimumHeight = item.usageRows
            ? usageHeight(item, cellWidth)
            : item.minimumHeight
          const usage = item.usageRows
            ? placeSections({
                providerRows: item.usageRows,
                width: contentWidth,
                height: Math.max(
                  0,
                  cellHeight - (item.insetHeight ?? 0),
                ),
                isAdaptive: true,
                minimumScale: 0.65,
                hasViewHeading: false,
              })
            : undefined
          const factsHeight = item.isPrinter
            ? measureFacts(item.key, cellWidth, detailLevel)
            : 0
          return [
            {
              priority: item.priority,
              width: usage
                ? usage.scale * 100
                : contentWidth,
              height: usage
                ? 1
                : Math.max(
                    0,
                    cellHeight -
                      factsHeight -
                      (item.isPrinter && detailLevel < 3
                        ? 12
                        : 0),
                  ),
              visibilityPriority: item.isPrinter
                ? 3
                : undefined,
              isHidden: item.isPrinter && detailLevel === 3,
              minimumWidth:
                item.isPrinter && detailLevel < 3
                  ? 100
                  : undefined,
              minimumHeight:
                item.isPrinter && detailLevel < 3
                  ? 56
                  : undefined,
              aspectRatio: usage
                ? undefined
                : item.aspectRatio,
              idealArea: item.isPrinter
                ? undefined
                : item.minimumWidth *
                  item.minimumHeight *
                  4,
            },
            {
              priority: 0,
              width: cellWidth,
              height: cellHeight,
              minimumWidth: item.minimumWidth,
              minimumHeight: Math.max(
                minimumHeight,
                factsHeight +
                  (item.isPrinter && detailLevel < 3
                    ? 68
                    : 0),
              ),
            },
            ...(item.isPrinter
              ? [
                  {
                    priority: 0,
                    visibilityPriority: 2,
                    isHidden: detailLevel >= 2,
                    width: 1,
                    height: 1,
                  },
                  {
                    priority: 0,
                    visibilityPriority: 1,
                    isHidden: detailLevel >= 1,
                    width: 1,
                    height: 1,
                  },
                ]
              : []),
          ]
        },
      )
      return {
        id,
        detailLevel,
        sections,
        style: {
          gridTemplateColumns: columns
            .map(
              (value) =>
                `minmax(0, ${Math.max(1, value)}fr)`,
            )
            .join(" "),
          gridTemplateRows: rows
            .map(
              (value) =>
                `minmax(0, ${Math.max(1, value)}fr)`,
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
    })
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
    const columnWidth =
      (width - gap * (columnCount - 1)) / columnCount
    const minimumSupportHeight = Math.max(
      0,
      ...supporting.map((item, index) => {
        const span =
          index === supporting.length - 1
            ? columnCount - (index % columnCount)
            : 1
        const cellWidth =
          columnWidth * span + gap * (span - 1)
        return item.usageRows
          ? usageHeight(item, cellWidth)
          : item.minimumHeight
      }),
    )
    const fittedPrinterHeight = Math.max(
      0,
      ...printers.map((item, index) => {
        const span =
          index === printers.length - 1
            ? columnCount - (index % columnCount)
            : 1
        const cellWidth =
          columnWidth * span + gap * (span - 1)
        return (
          measureFacts(item.key, cellWidth) +
          (cellWidth - (item.insetWidth ?? 0)) /
            (item.aspectRatio ?? 16 / 9)
        )
      }),
    )
    const reclaimedHeight =
      (height -
        gap * Math.max(0, printerRows + supportRows - 1) -
        fittedPrinterHeight * printerRows) /
      Math.max(1, supportRows)
    const supportHeights =
      printerRows && supportRows
        ? [
            ...new Set([
              minimumSupportHeight,
              ...[1.2, 1.4, 1.6, 1.8, 2].map(
                (scale) => minimumSupportHeight * scale,
              ),
              Math.max(
                minimumSupportHeight,
                reclaimedHeight,
              ),
              200,
              280,
              360,
              Math.min(440, height / 2),
            ]),
          ]
        : [height]
    return supportHeights.flatMap((supportHeight) => {
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
            return columnCounts.flatMap((columnCount) => {
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
