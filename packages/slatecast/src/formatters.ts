const dateFormatters = new Map<
  string,
  Intl.DateTimeFormat
>()
const numberFormatter = new Intl.NumberFormat("en-US")

/** Reuse expensive Intl setup without retaining an unbounded set of timezone/format combinations. */
export const getDateTimeFormatter = ({
  locale,
  options,
}: {
  locale?: string
  options: Intl.DateTimeFormatOptions
}) => {
  const key = JSON.stringify([locale, options])
  const existing = dateFormatters.get(key)
  if (existing) return existing
  const formatter = new Intl.DateTimeFormat(locale, options)
  if (dateFormatters.size >= 32) {
    const oldest = dateFormatters.keys().next().value
    if (oldest !== undefined) dateFormatters.delete(oldest)
  }
  dateFormatters.set(key, formatter)
  return formatter
}

/** The existing US number presentation, with one shared formatter per document. */
export const formatNumber = (value: number) =>
  numberFormatter.format(value)
