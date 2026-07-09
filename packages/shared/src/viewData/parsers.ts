import type {
  AgendaData,
  AgendaEvent,
  NowPlayingData,
  QueueData,
  QueueItem,
  WeatherData,
} from "./types.ts"

/**
 * Parsers for the view-data payloads Home Assistant PUSHES to CastKit over MQTT
 * (`<base>/<device>/{now_playing,queue,weather,agenda}/set`). CastKit never
 * reads HA — it renders whatever HA hands it here. See
 * docs/decisions/2026-07-04-inkcast-renders-ha-pushed-data-not-reads-ha.md.
 *
 * Each parser is defensive: HA templates can emit partial/empty payloads, so a
 * malformed field degrades to a sensible default rather than throwing.
 */

/** What a now-playing view shows when nothing is playing / no payload yet. */
export const IDLE_NOW_PLAYING: NowPlayingData = {
  artist: "—",
  title: "Nothing playing",
  isPlaying: false,
}

/**
 * YouTube titles (and YouTube Music) decorate text with ♫/♪ notes and emoji
 * (🐦 📚 …). The panel font (Atkinson Hyperlegible) has no emoji glyphs, so
 * they render as ▯ tofu boxes and waste width — strip both from every field.
 * A render-time safety net: HA is free to clean titles too, but this guarantees
 * the panel never shows tofu regardless of what it is handed.
 */
export const stripDecorativeNotes = (value: string) =>
  value
    // Zero-width joiner + variation selectors glue emoji sequences together;
    // drop them (not to a space), each on its own so the character class can't
    // match a joined sequence.
    .replace(/\u{200D}/gu, "")
    .replace(/[\u{FE00}-\u{FE0F}]/gu, "")
    // Emoji/pictographs, dingbats & symbols, arrows, misc symbols, and bullets.
    .replace(
      /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{2022}]/gu,
      " ",
    )
    .replace(/\s{2,}/g, " ")
    .trim()

const readString = (value: unknown): string =>
  typeof value === "string"
    ? stripDecorativeNotes(value)
    : ""

const readFiniteNumber = (
  value: unknown,
): number | undefined =>
  typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined

/** ISO string or epoch ms → epoch ms, or undefined when unusable. */
const readEpochMs = (
  value: unknown,
): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? undefined : parsed
  }
  return undefined
}

const readArtworkPath = (
  value: unknown,
): string | undefined =>
  typeof value === "string" && value.length > 0
    ? value
    : undefined

/**
 * `{ title, artist?, album?, isPlaying, artwork? }` → now-playing view data.
 * `artwork` is a URL (stored as `artworkPath`). A payload with neither title
 * nor artist renders the idle placeholder.
 *
 * Interactive-controller fields (`position`, `positionUpdatedAt`, `duration`,
 * `volume`, `isMuted`) are optional extensions for browser-mode devices; the
 * original minimal e-ink payload parses exactly as before.
 */
export const parseNowPlayingPayload = (
  payload: unknown,
): NowPlayingData => {
  if (typeof payload !== "object" || payload === null) {
    return IDLE_NOW_PLAYING
  }
  const record = payload as Record<string, unknown>

  const artist = readString(record.artist)
  const title = readString(record.title)
  if (!artist && !title) {
    return IDLE_NOW_PLAYING
  }

  const album = readString(record.album)
  const artworkPath = readArtworkPath(record.artwork)

  const positionSeconds = readFiniteNumber(record.position)
  const positionUpdatedAtMs = readEpochMs(
    record.positionUpdatedAt,
  )
  const durationSeconds = readFiniteNumber(record.duration)
  const volume = readFiniteNumber(record.volume)

  return {
    artist: artist || "—",
    title: title || "—",
    ...(album ? { album } : {}),
    isPlaying: record.isPlaying === true,
    ...(artworkPath ? { artworkPath } : {}),
    ...(positionSeconds !== undefined
      ? { positionSeconds }
      : {}),
    ...(positionUpdatedAtMs !== undefined
      ? { positionUpdatedAtMs }
      : {}),
    ...(durationSeconds !== undefined
      ? { durationSeconds }
      : {}),
    ...(volume !== undefined ? { volume } : {}),
    ...(typeof record.isMuted === "boolean"
      ? { isMuted: record.isMuted }
      : {}),
  }
}

/** Queue items are capped here so a runaway HA template can't flood clients. */
const MAX_QUEUE_ITEMS = 50

/**
 * `{ items: [{ title, artist?, artwork?, duration?, isCurrent? }] }` → queue
 * view data. Items without a title are dropped; the list is capped at
 * MAX_QUEUE_ITEMS.
 */
export const parseQueuePayload = (
  payload: unknown,
): QueueData => {
  if (typeof payload !== "object" || payload === null) {
    return { items: [] }
  }
  const record = payload as Record<string, unknown>
  const rawItems = Array.isArray(record.items)
    ? record.items
    : []

  const items: QueueItem[] = rawItems
    .map((rawItem): QueueItem | null => {
      if (typeof rawItem !== "object" || rawItem === null) {
        return null
      }
      const itemRecord = rawItem as Record<string, unknown>
      const title = readString(itemRecord.title)
      if (!title) {
        return null
      }
      const artworkPath = readArtworkPath(
        itemRecord.artwork,
      )
      const durationSeconds = readFiniteNumber(
        itemRecord.duration,
      )
      return {
        title,
        artist: readString(itemRecord.artist) || "—",
        ...(artworkPath ? { artworkPath } : {}),
        ...(durationSeconds !== undefined
          ? { durationSeconds }
          : {}),
        isCurrent: itemRecord.isCurrent === true,
      }
    })
    .filter((item): item is QueueItem => item !== null)
    .slice(0, MAX_QUEUE_ITEMS)

  return { items }
}

/** HA weather-entity condition codes → panel-friendly text. */
const WEATHER_CONDITION_TEXT: Record<string, string> = {
  "clear-night": "Clear night",
  cloudy: "Cloudy",
  exceptional: "Severe weather",
  fog: "Fog",
  hail: "Hail",
  lightning: "Lightning",
  "lightning-rainy": "Thunderstorms",
  partlycloudy: "Partly cloudy",
  pouring: "Pouring",
  rainy: "Rainy",
  snowy: "Snowy",
  "snowy-rainy": "Sleet",
  sunny: "Sunny",
  windy: "Windy",
  "windy-variant": "Windy",
}

/**
 * `{ temperature: number, condition?: string }` → weather view data, or null
 * when there is no usable temperature yet. Temperature rounding + the condition
 * text map are presentation (CastKit's job); HA sends the raw values.
 */
export const parseWeatherPayload = (
  payload: unknown,
): WeatherData | null => {
  if (typeof payload !== "object" || payload === null) {
    return null
  }
  const record = payload as Record<string, unknown>
  const temperature = record.temperature
  if (typeof temperature !== "number") {
    return null
  }

  const condition =
    typeof record.condition === "string"
      ? record.condition
      : ""

  return {
    temperatureText: `${Math.round(temperature)}°`,
    conditionText:
      WEATHER_CONDITION_TEXT[condition] ??
      (condition === "unavailable" ||
      condition === "unknown"
        ? ""
        : condition),
  }
}

const toStartMs = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

/**
 * `{ events: [{ start: epochMs | ISO, summary, isAllDay? }] }` → agenda data,
 * sorted ascending by start. Events without a usable start or summary are
 * dropped, and exact duplicates are collapsed — when HA aggregates several
 * calendar entities that share an appointment (e.g. a personal and a shared
 * family calendar both carrying the same event) the identical rows would
 * otherwise render twice on the panel. The registry filters to "upcoming" and
 * slices to the panel budget.
 */
export const parseAgendaPayload = (
  payload: unknown,
): AgendaData => {
  if (typeof payload !== "object" || payload === null) {
    return { events: [] }
  }
  const record = payload as Record<string, unknown>
  const rawEvents = Array.isArray(record.events)
    ? record.events
    : []

  const seenEventKeys = new Set<string>()
  const events: AgendaEvent[] = rawEvents
    .map((rawEvent): AgendaEvent | null => {
      if (
        typeof rawEvent !== "object" ||
        rawEvent === null
      ) {
        return null
      }
      const eventRecord = rawEvent as Record<
        string,
        unknown
      >
      const startMs = toStartMs(eventRecord.start)
      const summary =
        typeof eventRecord.summary === "string"
          ? eventRecord.summary.trim()
          : ""
      if (startMs === null || !summary) {
        return null
      }
      return {
        startMs,
        summary,
        isAllDay: eventRecord.isAllDay === true,
      }
    })
    .filter((event): event is AgendaEvent => event !== null)
    .filter((event) => {
      // Collapse events that are identical in start, all-day flag, and
      // summary — the same appointment surfaced by more than one calendar.
      const eventKey = `${event.startMs}|${event.isAllDay}|${event.summary}`
      if (seenEventKeys.has(eventKey)) {
        return false
      }
      seenEventKeys.add(eventKey)
      return true
    })
    .sort(
      (firstEvent, secondEvent) =>
        firstEvent.startMs - secondEvent.startMs,
    )

  return { events }
}
