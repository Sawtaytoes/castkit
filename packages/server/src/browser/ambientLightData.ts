import type { ViewDataState } from "@castkit/shared/protocol/ws"

/** Effect inputs use current normalized view feeds; missing data does not invent progress. */
export const buildAmbientLightData = ({
  data,
  nowMs = Date.now(),
}: {
  data: Pick<ViewDataState, "nowPlaying" | "agenda"> & {
    weather?: { condition?: string }
  }
  nowMs?: number
}) => {
  const music = data.nowPlaying
  const durationSeconds =
    music?.durationSeconds &&
    Number.isFinite(music.durationSeconds) &&
    music.durationSeconds > 0
      ? music.durationSeconds
      : null
  const elapsed =
    music?.isPlaying &&
    music.positionUpdatedAtMs !== undefined
      ? Math.max(0, nowMs - music.positionUpdatedAtMs) /
        1000
      : 0
  const position = music?.positionSeconds
  const nextEvent = data.agenda?.events
    .filter(
      (event) => !event.isAllDay && event.startMs >= nowMs,
    )
    .toSorted(
      (first, second) => first.startMs - second.startMs,
    )[0]
  return {
    progress:
      durationSeconds &&
      position !== undefined &&
      Number.isFinite(position)
        ? Math.max(
            0,
            Math.min(
              1,
              (position + elapsed) / durationSeconds,
            ),
          )
        : 0,
    isPlaying: music?.isPlaying ?? false,
    durationSeconds,
    secondsUntilEvent: nextEvent
      ? Math.max(0, (nextEvent.startMs - nowMs) / 1000)
      : null,
    weather: data.weather?.condition ?? "",
  }
}
