/** Compact metadata and touch transport take the card's first 112 pixels. */
export const COMPACT_MUSIC_HEIGHT = 112
/** Upcoming section heading height, shared by measurement and composition scoring. */
export const COMPACT_QUEUE_HEADING_HEIGHT = 26
/** Only complete queue rows may consume the remaining card height. */
export const COMPACT_QUEUE_ROW_HEIGHT = 40

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
