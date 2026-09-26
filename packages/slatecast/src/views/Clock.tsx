import type { BrowserClockConfig } from "@castkit/shared/protocol/ws"
import { clockConfig, nowMs } from "../state.ts"
import {
  formatClockDate,
  formatClockTime,
  formatClockTimeParts,
  formatDateTile,
} from "../time.ts"
import { useIsShortPanel } from "../useIsShortPanel.ts"

/**
 * Plain clock: big time + date, no weather — the browser-native counterpart to
 * the ePaper "Clock" view (color, no dithering). Client-side off the shared
 * 1 Hz tick in the device-local timezone. Reuses the `.ambient` layout, which
 * is already a centered time-over-date stack.
 *
 * On the short landscape panel the stack becomes a wall-calendar tile beside
 * the time: "FRI / 11 / SEP" in a raised block at the left, the hours and
 * minutes at the right with the meridiem under their last digit. The tile's
 * three strings are never wider than three characters, so nothing on that
 * panel needs fitting.
 */
export const Clock = () => (
  <ClockFace
    currentMillis={nowMs.value}
    clock={clockConfig.value}
  />
)

/**
 * The Clock view's drawing, fed by its caller: the device page passes the
 * device's signals, a platform panel passes its own tick and settings. Both
 * draw the same face, so a display moved onto a platform screen keeps the
 * short-panel layout it was designed with.
 */
export const ClockFace = ({
  currentMillis,
  clock,
}: {
  currentMillis: number
  clock: BrowserClockConfig | undefined
}) => {
  const isShortPanel = useIsShortPanel()

  if (!isShortPanel) {
    return (
      <div class="ambient">
        <div class="ambient-time">
          {formatClockTime(currentMillis, clock)}
        </div>
        <div class="ambient-date">
          {formatClockDate(currentMillis, clock)}
        </div>
      </div>
    )
  }

  const { time, meridiem } = formatClockTimeParts(
    currentMillis,
    clock,
  )
  const tile = formatDateTile(currentMillis, clock)

  return (
    <div class="clock-short">
      <div class="date-tile">
        <span class="date-tile-weekday">
          {tile.weekday}
        </span>
        <span class="date-tile-day">{tile.day}</span>
        <span class="date-tile-month">{tile.month}</span>
      </div>
      <div class="clock-short-time">
        <span class="clock-short-hours">{time}</span>
        {meridiem ? (
          <span class="clock-short-meridiem">
            {meridiem}
          </span>
        ) : null}
      </div>
    </div>
  )
}
