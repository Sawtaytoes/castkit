/**
 * Track durations/positions as `m:ss`. Negative and fractional inputs are
 * clamped and floored — the live seek position is a float that can briefly go
 * slightly negative between a push and its timestamp.
 */
export const formatTime = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(whole / 60)
  const remainder = whole % 60
  return `${minutes}:${String(remainder).padStart(2, "0")}`
}
