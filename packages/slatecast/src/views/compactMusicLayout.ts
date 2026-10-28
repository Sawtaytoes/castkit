/** Compact metadata and touch transport take the card's first 112 pixels. */
export const COMPACT_MUSIC_HEIGHT = 112
/** Upcoming section heading height, shared by measurement and composition scoring. */
export const COMPACT_QUEUE_HEADING_HEIGHT = 26
/** Only complete queue rows may consume the remaining card height. */
export const COMPACT_QUEUE_ROW_HEIGHT = 40

/** The rendered card and composition scorer use the same two-dimensional budget. */
export const getCompactMusicLayout = ({
  width,
  height,
}: {
  width: number
  height: number
}) => {
  const isWide = width >= 720
  const isRoomy = height >= 170
  const primaryWidth = Math.min(480, width * 0.4)
  const queueColumns = isWide
    ? Math.max(
        1,
        Math.floor((width - primaryWidth - 45) / 240),
      )
    : 1
  const queueRowHeight = isWide
    ? 58
    : COMPACT_QUEUE_ROW_HEIGHT
  const queueRows = isWide
    ? Math.max(
        0,
        Math.floor(
          (height - COMPACT_QUEUE_HEADING_HEIGHT) /
            queueRowHeight,
        ),
      )
    : countCompactQueueRows(height)
  return {
    isWide,
    isRoomy,
    primaryWidth,
    artworkSize: isWide
      ? Math.max(
          64,
          Math.min(144, height - (isRoomy ? 52 : 44)),
        )
      : 64,
    queueColumns,
    queueRowHeight,
    queueRows,
    queueCount: queueRows * queueColumns,
  }
}

/** Count the complete upcoming rows that fit after required player content. */
export const countCompactQueueRows = (height: number) =>
  Math.max(
    0,
    Math.floor(
      (height -
        COMPACT_MUSIC_HEIGHT -
        COMPACT_QUEUE_HEADING_HEIGHT) /
        COMPACT_QUEUE_ROW_HEIGHT,
    ),
  )
