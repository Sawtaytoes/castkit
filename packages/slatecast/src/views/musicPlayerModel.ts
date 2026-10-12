import type { ContractData } from "@castkit/sdk/contracts"

/** One channel snapshot of the music player. */
export type MusicPlayerData =
  ContractData["music-player.v1"]
/** One queue row. */
export type MusicQueueItem = NonNullable<
  MusicPlayerData["queue"]
>["items"][number]
/** One lyric line; only synced lines carry a start time. */
export type LyricLine = NonNullable<
  MusicPlayerData["lyrics"]
>["lines"][number]

/**
 * Where the track is now. Music Assistant reports a position and when it
 * was true, so a playing track is extrapolated from that moment rather than
 * waiting for the next report. A paused track stays where it stopped.
 */
export const readLivePositionSeconds = ({
  data,
  nowMs,
}: {
  data: MusicPlayerData
  nowMs: number
}) => {
  const position = data.positionSeconds ?? 0
  const isPlaying = data.player?.state === "playing"
  const elapsed =
    isPlaying && data.positionUpdatedAtMs !== undefined
      ? Math.max(
          0,
          (nowMs - data.positionUpdatedAtMs) / 1000,
        )
      : 0
  const duration = data.current?.durationSeconds
  return duration === undefined
    ? position + elapsed
    : Math.min(duration, position + elapsed)
}

/** The synced lyric line being sung at `positionSeconds`, or -1 before the first. */
export const findCurrentLyricIndex = ({
  lines,
  positionSeconds,
}: {
  lines: LyricLine[]
  positionSeconds: number
}) =>
  lines.reduce(
    (found, line, index) =>
      line.startSeconds !== undefined &&
      line.startSeconds <= positionSeconds
        ? index
        : found,
    -1,
  )

/**
 * Split the queue window into what already played, the current row, and
 * what is next. `playedRowCount` keeps only the most recent played rows.
 */
export const splitQueue = ({
  items,
  currentIndex,
  playedRowCount,
}: {
  items: MusicQueueItem[]
  currentIndex: number | undefined
  playedRowCount: number
}) => {
  const ordered = [...items].sort(
    (first, second) => first.index - second.index,
  )
  if (currentIndex === undefined) {
    return {
      played: [] as MusicQueueItem[],
      current: undefined,
      upcoming: ordered,
    }
  }
  const played = ordered.filter(
    (item) => item.index < currentIndex,
  )
  return {
    played: played.slice(
      Math.max(
        0,
        played.length - Math.max(0, playedRowCount),
      ),
    ),
    current: ordered.find(
      (item) => item.index === currentIndex,
    ),
    upcoming: ordered.filter(
      (item) => item.index > currentIndex,
    ),
  }
}

/**
 * Resample the source's waveform to the number of bars that fit, taking
 * each span's peak. Fewer source points than bars stretches each point.
 */
export const resampleWaveform = ({
  values,
  barCount,
}: {
  values: number[]
  barCount: number
}) =>
  values.length && barCount > 0
    ? Array.from({ length: barCount }, (_, barIndex) => {
        const start = Math.floor(
          (barIndex * values.length) / barCount,
        )
        const end = Math.max(
          start + 1,
          Math.floor(
            ((barIndex + 1) * values.length) / barCount,
          ),
        )
        return Math.max(...values.slice(start, end))
      })
    : []

/** The track position under a pointer at `fraction` (0 to 1) of the seek bar. */
export const readSeekSeconds = ({
  fraction,
  durationSeconds,
}: {
  fraction: number
  durationSeconds: number
}) =>
  Math.round(
    Math.min(1, Math.max(0, fraction)) * durationSeconds,
  )

/**
 * How many upcoming rows finish inside the queue list. The list holds
 * section labels, the played rows and the current row first; a row the
 * list would cut in half is not drawn.
 */
export const countUpcomingRows = ({
  listHeight,
  rowHeight,
  labelHeight,
  playedRowCount,
  hasCurrent,
}: {
  listHeight: number
  rowHeight: number
  labelHeight: number
  playedRowCount: number
  hasCurrent: boolean
}) => {
  const used =
    (playedRowCount > 0
      ? labelHeight + playedRowCount * rowHeight
      : 0) +
    (hasCurrent ? labelHeight + rowHeight : 0) +
    labelHeight
  return Math.max(
    0,
    Math.floor((listHeight - used) / rowHeight),
  )
}
