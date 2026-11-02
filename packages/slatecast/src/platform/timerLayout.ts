import type { ContractData } from "@castkit/sdk/contracts"
import { selectPriorityLayout } from "@charcuterie/logic/core"

type TimerEntity =
  ContractData["entities.v1"]["entities"][number]
/** Running timers rank by absolute deadline; paused timers follow in stable ID order. */
export const rankTimers = (entities: TimerEntity[]) =>
  entities.toSorted((left, right) => {
    const deadline = (entity: TimerEntity) =>
      entity.state === "active"
        ? Date.parse(
            String(entity.attributes.finishes_at),
          ) || Infinity
        : Infinity
    return (
      deadline(left) - deadline(right) ||
      left.id
        .replace(/\.r\d+$/, "")
        .localeCompare(right.id.replace(/\.r\d+$/, ""))
    )
  })
/** Let the shared priority policy retain timers first, then buy area for the nearest deadline. */
export const chooseTimerLayout = ({
  count,
  width,
  height,
  hasControls,
}: {
  count: number
  width: number
  height: number
  hasControls: boolean
}) => {
  const minimumHeight = hasControls ? 164 : 120
  const minimumWidth = hasControls ? 180 : 140
  const maximumVisible = Math.min(
    count,
    Math.max(
      1,
      Math.floor(
        (width * height) / (minimumWidth * minimumHeight),
      ),
    ),
  )
  const candidates = Array.from(
    { length: maximumVisible },
    (_, index) => index + 1,
  ).flatMap((visibleCount) =>
    Array.from(
      { length: visibleCount },
      (_, index) => index + 1,
    ).map((columns) => {
      const rows = Math.ceil(visibleCount / columns)
      const cellWidth = Math.max(
        0,
        (width - (columns - 1) * 8) / columns,
      )
      const baseHeight = Math.max(
        0,
        (height - (rows - 1) * 8) / rows,
      )
      const firstHeight =
        columns === 1
          ? Math.max(
              baseHeight,
              height -
                (visibleCount - 1) * (minimumHeight + 8),
            )
          : baseHeight
      return {
        id: `${visibleCount}:${columns}`,
        isRail: false,
        visibleCount,
        columns,
        firstHeight,
        sections: Array.from(
          { length: count },
          (_, timerIndex) => ({
            priority: count - timerIndex,
            visibilityPriority: count - timerIndex,
            isHidden: timerIndex >= visibleCount,
            width: cellWidth,
            height:
              timerIndex === 0
                ? firstHeight
                : columns === 1
                  ? minimumHeight
                  : baseHeight,
            minimumWidth,
            minimumHeight,
          }),
        ),
      }
    }),
  )
  const rails = Array.from(
    { length: Math.max(0, maximumVisible - 1) },
    (_, index) => index + 2,
  ).map((visibleCount) => ({
    id: `rail:${visibleCount}`,
    isRail: true,
    visibleCount,
    columns: 2,
    firstHeight: height,
    sections: Array.from({ length: count }, (_, index) => ({
      priority: count - index,
      visibilityPriority: count - index,
      isHidden: index >= visibleCount,
      width:
        index === 0
          ? width -
            8 -
            Math.max(minimumWidth, (width - 8) / 3)
          : Math.max(minimumWidth, (width - 8) / 3),
      height:
        index === 0
          ? height
          : (height - (visibleCount - 2) * 8) /
            (visibleCount - 1),
      minimumWidth,
      minimumHeight,
    })),
  }))
  return selectPriorityLayout([...candidates, ...rails])
}
