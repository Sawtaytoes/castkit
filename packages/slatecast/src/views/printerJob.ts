import type { BrowserClockConfig } from "@castkit/shared/protocol/ws"
import type { PrinterJob } from "@castkit/shared/viewData/types"
import {
  formatClockMonthDay,
  formatClockTime,
  formatClockWeekdayShort,
  getClockDayOffset,
} from "../time.ts"

/**
 * The printer reports a SLICER FILE NAME, not a title. Underscores stand in for
 * spaces and `_-_` separates the parts the owner typed, so the parts are joined
 * with a middle dot rather than a dash — a dash reads as a subtitle and the
 * owner rejected it on the mock-up.
 *
 * Exactly one part is dropped: the printer's own name, which the card already
 * carries two lines above. Nothing else is guessed away. The whole file name is
 * one tap behind the expander and in the element's title, because a name this
 * function shortened wrongly must still be readable without walking to the
 * printer.
 */
export const getPrinterJobTitle = (
  job: Pick<PrinterJob, "jobName" | "name">,
): string => {
  const printerName = job.name.toLowerCase()
  const parts = job.jobName
    .split("_-_")
    .map((part) => part.replaceAll("_", " ").trim())
    .filter(Boolean)
    .filter((part) => part.toLowerCase() !== printerName)

  const lastPart = parts[parts.length - 1]
  if (lastPart?.toLowerCase().endsWith(` ${printerName}`)) {
    parts[parts.length - 1] = lastPart
      .slice(0, -(printerName.length + 1))
      .trim()
  }
  return parts.join(" · ")
}

/**
 * Minutes as the panel says them out loud: "2h 08m", "47m". Hours are not
 * padded and minutes are, so the two columns of a three-printer panel line up
 * under tabular numerals.
 */
export const formatRemaining = (
  totalMinutes: number,
): string => {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0
    ? `${hours}h ${String(minutes).padStart(2, "0")}m`
    : `${minutes}m`
}

/**
 * When the print is expected to finish, epoch ms, or null when nothing says.
 *
 * Home Assistant's own end-time is preferred: the printer computes it against
 * its real remaining work, and it survives a payload that rounded the minutes.
 * The fallback keeps the row populated on a printer whose integration only
 * reports remaining time.
 */
export const getFinishAtMs = ({
  job,
  nowMillis,
}: {
  job: PrinterJob
  nowMillis: number
}): number | null => {
  if (job.finishAtMs !== undefined) {
    return job.finishAtMs
  }
  return job.remainingMinutes === undefined
    ? null
    : nowMillis + job.remainingMinutes * 60_000
}

/**
 * The finish as a person reads it off the glass: "3:47 PM" later today,
 * "Tomorrow 3:47 PM", "Fri 3:47 PM" further out.
 *
 * A bare clock time reads as TODAY. A print that ended the next afternoon
 * showed "3:47 PM" on the workbench panel, and the owner read three hours where
 * the printer meant twenty-seven.
 *
 * The day is named whenever the finish falls on a DIFFERENT CALENDAR DAY, not
 * when it is more than twenty-four hours out. Midnight is the boundary a person
 * means: an overnight print ending at 01:00 is eight hours away and is still
 * not today, and the bare time would misread there in the same way.
 *
 * The words match BambuBuddy's own ETA, which is where the same finish is read
 * everywhere else in the house.
 *
 * A weekday stops naming a day once the name comes round again, so a week or
 * more out gets the date. No print runs that long; a bad end time pushed by an
 * integration can still say it does, and the card must not answer "Fri" to a
 * date eight days away.
 */
export const formatFinishTime = ({
  clock,
  finishAtMs,
  nowMillis,
}: {
  clock?: BrowserClockConfig
  finishAtMs: number
  nowMillis: number
}): string => {
  const time = formatClockTime(finishAtMs, clock)
  const dayOffset = getClockDayOffset({
    clock,
    fromMillis: nowMillis,
    toMillis: finishAtMs,
  })

  if (dayOffset <= 0) {
    return time
  }
  if (dayOffset === 1) {
    return `Tomorrow ${time}`
  }
  if (dayOffset < 7) {
    return `${formatClockWeekdayShort(finishAtMs, clock)} ${time}`
  }
  return `${formatClockMonthDay(finishAtMs, clock)} ${time}`
}
