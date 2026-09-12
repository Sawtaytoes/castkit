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
 * the ePaper "Clock" view (colour, no dithering). Client-side off the shared
 * 1 Hz tick in the device-local timezone. Reuses the `.ambient` layout, which
 * is already a centered time-over-date stack.
 *
 * On the short landscape panel the stack becomes a wall-calendar tile beside
 * the time: "FRI / 11 / SEP" in a raised block at the left, the hours and
 * minutes at the right with the meridiem under their last digit. The tile's
 * three strings are never wider than three characters, so nothing on that
 * panel needs fitting.
 */
export const Clock = () => {
  const isShortPanel = useIsShortPanel()
  const currentMillis = nowMs.value
  const clock = clockConfig.value

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
