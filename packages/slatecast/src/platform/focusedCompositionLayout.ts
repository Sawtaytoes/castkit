import type { JSX } from "preact"
import { placeSections } from "./aiUsageLayout.ts"
import type { CompositionItem } from "./compositionLayout.ts"

/** Reserve a readable task column first; selected AI numbers get only spare space. */
export const chooseFocusedCompositionLayout = ({
  width,
  height,
  gap,
  items,
  focusedKey,
}: {
  width: number
  height: number
  gap: number
  items: readonly CompositionItem[]
  focusedKey: string
}) => {
  const focused = items.find(
    (item) => item.key === focusedKey,
  )
  if (!focused) return undefined
  // A vertical detail needs the width of a small panel, plus its composition padding.
  const detailWidth =
    (focused.focusMinimumWidth ?? 480) +
    (focused.insetWidth ?? 0)
  const availableRailWidth = Math.min(
    360,
    width - detailWidth - gap,
  )
  const supporting = items
    .filter(
      (item) =>
        item.key !== focusedKey &&
        item.usageRows?.some((entry) => entry.rows.length),
    )
    .toSorted(
      (left, right) => right.priority - left.priority,
    )
  const visible: CompositionItem[] = []
  for (const item of supporting) {
    const next = [...visible, item]
    const cellHeight =
      (height - gap * (next.length - 1)) / next.length
    const isFitting = next.every((candidate) => {
      const contentWidth =
        availableRailWidth - (candidate.insetWidth ?? 0)
      if (contentWidth < 220) return false
      const usage = placeSections({
        providerRows: candidate.usageRows ?? [],
        width: contentWidth,
        height: cellHeight - (candidate.insetHeight ?? 0),
        isAdaptive: true,
        minimumScale: 1,
        hasViewHeading: false,
      })
      return usage.hiddenRowCount === 0
    })
    if (isFitting) visible.push(item)
  }
  return {
    id: "rail" as const,
    detailLevel: 0 as const,
    style: {
      gridTemplateColumns: visible.length
        ? `minmax(0, 1fr) ${availableRailWidth}px`
        : "minmax(0, 1fr)",
      gridTemplateRows: `repeat(${Math.max(1, visible.length)}, minmax(0, 1fr))`,
    } as JSX.CSSProperties,
    cells: Object.fromEntries(
      items.map((item) => {
        const index = visible.indexOf(item)
        return [
          item.key,
          item.key === focusedKey
            ? { gridColumn: "1", gridRow: "1 / -1" }
            : index >= 0
              ? { gridColumn: "2", gridRow: `${index + 1}` }
              : { display: "none" },
        ]
      }),
    ) as Record<string, JSX.CSSProperties>,
  }
}
