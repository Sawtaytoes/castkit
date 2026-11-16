import type { ContractData } from "@castkit/sdk/contracts"
import { selectPriorityLayout } from "@charcuterie/logic/core"

type TimerEntity =
  ContractData["entities.v1"]["entities"][number]
/**
 * Running timers rank by absolute deadline; paused timers follow in stable
 * ID order. A timer in its cancel-undo window ranks by the deadline it
 * still reports; `keepCancelingPlaces` holds the place it had on screen.
 */
export const rankTimers = (entities: TimerEntity[]) =>
  entities.toSorted((left, right) => {
    const deadline = (entity: TimerEntity) =>
      entity.state === "active" ||
      entity.state === "canceling"
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
  // A card holds its name, room, countdown, end time and finger-sized
  // round buttons, so it needs more room than a plain countdown.
  const minimumHeight = hasControls ? 200 : 120
  const minimumWidth = hasControls ? 200 : 140
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
  // A card with buttons reads best near square. Stacking cards whose
  // width is far more than their height leaves no room for the room name
  // and end time, so prefer another arrangement that keeps as many timers.
  const isTooWide = (
    candidate: (typeof candidates)[number],
  ) =>
    hasControls &&
    candidate.columns === 1 &&
    candidate.visibleCount > 1 &&
    candidate.sections
      .slice(0, candidate.visibleCount)
      .some(
        (section) =>
          section.width >
          section.height * MAX_STACKED_ASPECT,
      )
  const isUsable = (
    candidate: (typeof candidates)[number],
  ) =>
    candidate.sections
      .slice(0, candidate.visibleCount)
      .every(
        (section) =>
          section.width >= section.minimumWidth &&
          section.height >= section.minimumHeight,
      )
  const preferred = candidates.filter(
    (candidate) =>
      !isTooWide(candidate) ||
      !candidates.some(
        (other) =>
          !isTooWide(other) &&
          isUsable(other) &&
          other.visibleCount === candidate.visibleCount,
      ),
  )
  return selectPriorityLayout([...preferred, ...rails])
}
/** The widest stacked card, as width over height, before columns win. */
const MAX_STACKED_ASPECT = 1.6

/** A timer's ID without its revision, so it stays the same across changes. */
export const getTimerBaseId = (id: string) =>
  id.replace(/\.r\d+$/, "")
/**
 * A cancelled timer keeps the place its card had before the cancel, even
 * when the source changes or clears its deadline, so the Undo card takes
 * its place and no other card moves under a finger. `previous` is the
 * last order on screen, as base IDs. A timer the screen has not shown yet
 * keeps its ranked place.
 */
export const keepCancelingPlaces = (
  ranked: TimerEntity[],
  previous: readonly string[],
) => {
  const isHeld = (entity: TimerEntity) =>
    entity.state === "canceling" &&
    previous.includes(getTimerBaseId(entity.id))
  return ranked
    .filter(isHeld)
    .map((entity) => ({
      entity,
      index: previous.indexOf(getTimerBaseId(entity.id)),
    }))
    .toSorted((left, right) => left.index - right.index)
    .reduce(
      (placed, { entity, index }) =>
        placed.toSpliced(
          Math.min(index, placed.length),
          0,
          entity,
        ),
      ranked.filter((entity) => !isHeld(entity)),
    )
}

/** The number of distinct timer colors before one repeats. */
export const TIMER_HUE_COUNT = 4
/**
 * Give timers on screen different colors that stay put while the same
 * timers remain: each timer prefers a color from its own ID, and a clash
 * moves the later ID to the next free color. Ranking order is not used, so
 * adding five minutes never swaps two colors.
 */
export const assignTimerHues = (ids: string[]) => {
  const taken = new Set<number>()
  const hues = new Map<string, number>()
  ids
    .toSorted((left, right) =>
      getTimerBaseId(left).localeCompare(
        getTimerBaseId(right),
      ),
    )
    .forEach((id) => {
      const preferred =
        [...getTimerBaseId(id)].reduce(
          (total, character) =>
            (total * 31 + character.charCodeAt(0)) >>> 0,
          7,
        ) % TIMER_HUE_COUNT
      const hue =
        Array.from(
          { length: TIMER_HUE_COUNT },
          (_, offset) =>
            (preferred + offset) % TIMER_HUE_COUNT,
        ).find((candidate) => !taken.has(candidate)) ??
        preferred
      taken.add(hue)
      hues.set(id, hue)
    })
  return hues
}
const parseSeconds = (value: unknown) => {
  const match = /^(\d+):(\d{2}):(\d{2})$/.exec(
    String(value),
  )
  return match
    ? Number(match[1]) * 3600 +
        Number(match[2]) * 60 +
        Number(match[3])
    : Number.NaN
}
/** How much of the timer is left, from 1 (just started) to 0 (done). */
export const getTimerFraction = (
  entity: TimerEntity,
  now: number,
) => {
  const total = parseSeconds(entity.attributes.duration)
  const finish = Date.parse(
    String(entity.attributes.finishes_at),
  )
  const left =
    entity.state === "paused" || !Number.isFinite(finish)
      ? parseSeconds(entity.attributes.remaining)
      : (finish - now) / 1000
  if (!(total > 0) || !Number.isFinite(left)) return 1
  return Math.min(1, Math.max(0, left / total))
}
