import type { LayoutSection } from "@charcuterie/logic/core"
import { selectPriorityLayout } from "@charcuterie/logic/core"
import type { JSX } from "preact"
import {
  BASE_PROVIDER_HEADING_HEIGHT,
  getUsageRowHeight,
  placeSections,
} from "./aiUsageLayout.ts"
import type { selectProviderRows } from "./aiUsageRows.ts"
import type { PrinterDetailLevel } from "./printerContentFit.ts"

export type CompositionItem = {
  key: string
  priority: number
  isPrinter: boolean
  isOptional?: boolean
  pointsCount?: number
  focusMinimumWidth?: number
  aspectRatio?: number
  minimumWidth: number
  minimumHeight: number
  usageRows?: ReturnType<typeof selectProviderRows>
  insetWidth?: number
  insetHeight?: number
  summaryHeight?: number
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
        entry.rows.reduce(
          (total, row) => total + getUsageRowHeight(row),
          0,
        )) *
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
    // clientHeight is rounded to whole pixels when the child measures its panel.
    Math.ceil(
      candidates.find(
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
      ) ?? item.minimumHeight,
    ) + (item.insetHeight ?? 0)
  )
}

const minimumItemHeight = ({
  item,
  width,
}: {
  item: CompositionItem
  width: number
}) => {
  if (item.usageRows) return usageHeight(item, width)
  if (item.pointsCount) {
    const columns = Math.floor(
      (width - (item.insetWidth ?? 0) + 12) / 232,
    )
    const boardRows = Math.ceil(
      item.pointsCount / Math.max(1, columns),
    )
    const boardHeight =
      columns > 0
        ? boardRows * 200 + (boardRows - 1) * 12
        : Number.POSITIVE_INFINITY
    const rowsHeight =
      item.pointsCount * 128 + (item.pointsCount - 1) * 12
    return (
      Math.min(boardHeight, rowsHeight) +
      (item.insetHeight ?? 0)
    )
  }
  return item.minimumHeight
}

/** Score the composition with the same policy each media card uses internally. */
const chooseMainCompositionLayout = ({
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
  const highestPrinterPriority = Math.max(
    0,
    ...printers.map((printer) => printer.priority),
  )
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
          const minimumHeight = minimumItemHeight({
            item,
            width: cellWidth,
          })
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
                : item.isOptional
                  ? 0
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
              // Once supporting quotas reach their normal readable size,
              // extra height belongs to the media rather than larger labels.
              idealArea: usage
                ? item.priority > highestPrinterPriority
                  ? undefined
                  : 100
                : item.isPrinter
                  ? undefined
                  : item.minimumWidth *
                    item.minimumHeight *
                    4,
            },
            {
              priority: 0,
              width: cellWidth,
              height: cellHeight,
              // This section enforces fit only. Scoring its rectangle would
              // reward a wider supporting strip for absorbing empty space.
              idealArea: 0,
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
  // Unequal supporting rows preserve a full points board before music spends spare height.
  const stackedCandidates =
    printers.length === 0 &&
    supporting.length > 1 &&
    supporting.some((item) => item.isOptional)
      ? supporting.flatMap((recipient) => {
          const minimums = supporting.map((item) =>
            minimumItemHeight({ item, width }),
          )
          const spare = Math.max(
            0,
            height -
              gap * (supporting.length - 1) -
              minimums.reduce(
                (total, value) => total + value,
                0,
              ),
          )
          return makeCandidate({
            id: "cards",
            columns: [width],
            rows: minimums.map(
              (minimum, index) =>
                (minimum +
                  (supporting[index]?.key === recipient.key
                    ? spare
                    : 0)) *
                Math.min(
                  1,
                  Math.max(
                    0,
                    height - gap * (supporting.length - 1),
                  ) /
                    Math.max(
                      1,
                      minimums.reduce(
                        (total, value) => total + value,
                        0,
                      ),
                    ),
                ),
            ),
            cells: supporting.map((item, index) => ({
              key: item.key,
              column: 0,
              row: index,
              columnSpan: 1,
              rowSpan: 1,
            })),
          })
        })
      : []
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
  const candidates =
    mode === "cards"
      ? cardCandidates.concat(stackedCandidates)
      : mode === "rail" && railCandidates.length
        ? railCandidates
        : cardCandidates.concat(
            stackedCandidates,
            railCandidates,
          )
  return selectPriorityLayout(candidates)
}

const chooseOptionalCompositionLayout = (
  input: Parameters<typeof chooseMainCompositionLayout>[0],
) => {
  const { items } = input
  const layout = chooseMainCompositionLayout(input)
  const optional = items.filter((item) => item.isOptional)
  if (!optional.length) return layout
  const reduced = chooseMainCompositionLayout({
    ...input,
    items: items.filter((item) => !item.isOptional),
  })
  if (!reduced) return layout
  const hiddenSections = optional.map((item) => ({
    priority: item.priority,
    visibilityPriority: 0,
    isHidden: true,
    width: 0,
    height: 0,
  }))
  const selected = selectPriorityLayout([
    ...(layout ? [layout] : []),
    {
      ...reduced,
      sections: reduced.sections.concat(hiddenSections),
      cells: {
        ...reduced.cells,
        ...Object.fromEntries(
          optional.map((item) => [
            item.key,
            { display: "none" } as JSX.CSSProperties,
          ]),
        ),
      },
    },
  ])
  return selected
}

/** Keep persistent summaries below the higher-priority work area. */
export const chooseCompositionLayout = (
  input: Parameters<typeof chooseMainCompositionLayout>[0],
) => {
  const { width, height, gap, items, mode, measureFacts } =
    input
  const summaries = items.filter(
    (item) => item.summaryHeight !== undefined,
  )
  const primary = items.filter(
    (item) => item.summaryHeight === undefined,
  )
  if (summaries.length && primary.length) {
    const layout = chooseOptionalCompositionLayout({
      width,
      height:
        height -
        summaries.reduce(
          (total, item) =>
            total + item.summaryHeight! + gap,
          0,
        ),
      gap,
      items: primary,
      mode,
      measureFacts,
    })
    if (layout) {
      return {
        ...layout,
        style: {
          ...layout.style,
          gridTemplateRows: `${layout.style.gridTemplateRows} ${summaries.map((item) => `minmax(0, ${item.summaryHeight}fr)`).join(" ")}`,
        },
        cells: {
          ...layout.cells,
          ...Object.fromEntries(
            summaries.map((item, index) => [
              item.key,
              {
                gridColumn: "1 / -1",
                gridRow: `${index - summaries.length - 1} / span 1`,
              } as JSX.CSSProperties,
            ]),
          ),
        },
      }
    }
  }
  return chooseOptionalCompositionLayout(input)
}
