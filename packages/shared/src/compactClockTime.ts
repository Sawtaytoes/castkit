/** Compact an English day-period suffix without changing the clock digits. */
export const compactClockTime = (time: string) =>
  time.replace(/\s*([AP])M$/i, (_match, period: string) =>
    period.toLowerCase(),
  )
