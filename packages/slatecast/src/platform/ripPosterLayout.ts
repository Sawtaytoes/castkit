import { selectPriorityLayout } from "@charcuterie/logic/core"

/** Keep every active rip; posters disappear when their per-job reading area no longer fits. */
export const chooseRipPosterLayout = ({
  width,
  height,
  count,
  isPosterRequested,
}: {
  width: number
  height: number
  count: number
  isPosterRequested: boolean
}) => {
  const columns = Math.max(
    1,
    Math.min(count, Math.floor((width + 10) / 150)),
  )
  const rows = Math.max(1, Math.ceil(count / columns))
  const cardWidth = (width - 10 * (columns - 1)) / columns
  const cardHeight = (height - 10 * (rows - 1)) / rows
  const rowHeight =
    (height - 10 * Math.max(0, count - 1)) /
    Math.max(1, count)
  return selectPriorityLayout([
    ...(isPosterRequested
      ? [
          {
            id: "posters",
            columns,
            sections: [
              {
                priority: 2,
                visibilityPriority: 1,
                width: cardWidth,
                height: cardHeight - 100,
                minimumWidth: 140,
                minimumHeight: 80,
              },
              {
                priority: 1,
                width: cardWidth,
                height: cardHeight,
                minimumWidth: 140,
                minimumHeight: 180,
              },
            ],
          },
        ]
      : []),
    {
      id: "row-posters",
      columns: 1,
      sections: [
        {
          priority: 2,
          visibilityPriority: 1,
          width: 44,
          height: rowHeight - 16,
          minimumWidth: 44,
          minimumHeight: 64,
        },
        {
          priority: 1,
          width: width - 60,
          height: rowHeight,
          minimumWidth: 240,
          minimumHeight: 48,
        },
      ],
    },
    {
      id: "rows",
      columns: 1,
      sections: [
        {
          priority: 2,
          visibilityPriority: 1,
          isHidden: true,
          width: 0,
          height: 0,
        },
        {
          priority: 1,
          width,
          height: rowHeight,
          minimumWidth: 160,
          minimumHeight: 28,
        },
      ],
    },
  ])
}
