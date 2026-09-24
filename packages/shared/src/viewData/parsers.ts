import {
  type AgendaData,
  type AgendaEvent,
  type NowPlayingData,
  PRINTER_JOB_STATES,
  type PrinterJob,
  type PrinterJobState,
  type PrintersData,
  type QueueData,
  type QueueItem,
  WEATHER_CONDITION_CODES,
  type WeatherConditionCode,
  type WeatherData,
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
 * original minimal ePaper payload parses exactly as before.
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
const WEATHER_CONDITION_TEXT: Record<
  WeatherConditionCode,
  string
> = {
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
  const conditionCode = isWeatherConditionCode(condition)
    ? condition
    : undefined

  return {
    temperatureText: `${Math.round(temperature)}°`,
    conditionText: conditionCode
      ? WEATHER_CONDITION_TEXT[conditionCode]
      : condition === "unavailable" ||
          condition === "unknown"
        ? ""
        : condition,
    ...(conditionCode ? { condition: conditionCode } : {}),
  }
}

const isWeatherConditionCode = (
  value: string,
): value is WeatherConditionCode =>
  (WEATHER_CONDITION_CODES as readonly string[]).includes(
    value,
  )

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

/**
 * Drop the keys that came back undefined. The optional fields on a printer are
 * genuinely absent rather than undefined-valued (`exactOptionalPropertyTypes`),
 * and spelling that with a conditional spread per field buries the parse.
 */
const dropUndefined = <RecordType extends object>(
  record: RecordType,
): RecordType =>
  Object.fromEntries(
    Object.entries(record).filter(
      ([, value]) => value !== undefined,
    ),
  ) as RecordType

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const toPositiveInteger = (
  value: unknown,
): number | undefined => {
  const parsed = toFiniteNumber(value)
  return parsed === null || parsed < 0
    ? undefined
    : Math.round(parsed)
}

const toTrimmedText = (
  value: unknown,
): string | undefined => {
  if (typeof value !== "string") {
    return undefined
  }
  const trimmed = value.trim()
  // HA templates render an absent entity as one of these rather than omitting
  // the key, so they are "no value", not text to put on the glass.
  return trimmed === "" ||
    trimmed === "unknown" ||
    trimmed === "unavailable" ||
    trimmed === "None"
    ? undefined
    : trimmed
}

const toHexColor = (value: unknown): string | undefined => {
  const text = toTrimmedText(value)
  if (!text) {
    return undefined
  }
  // Bambu reports filament color as 8 hex digits (RGBA); the alpha is always
  // opaque and CSS would read `#RRGGBBAA` differently, so it is dropped.
  const hex = text.startsWith("#") ? text.slice(1) : text
  return /^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(hex)
    ? `#${hex.slice(0, 6).toLowerCase()}`
    : undefined
}

const toPrinterJobState = (
  value: unknown,
): PrinterJobState | null => {
  const text = toTrimmedText(value)?.toLowerCase()
  return text &&
    (PRINTER_JOB_STATES as readonly string[]).includes(text)
    ? (text as PrinterJobState)
    : null
}

/**
 * `{ printers: [{ id, name, jobName, percent, state, … }] }` → printer data.
 *
 * A printer without an id, a name or a state we act on is dropped: the id is
 * what a pause command is addressed to, and a card whose buttons cannot be
 * routed is worse than no card. Everything else degrades — a job with no layer
 * count still shows its percentage, which is the fact the view exists for.
 *
 * `{ printers: [] }` is a valid payload and the one that clears the glass, so
 * an unparseable payload returns an empty list too rather than throwing.
 */
export const parsePrintersPayload = (
  payload: unknown,
): PrintersData => {
  if (typeof payload !== "object" || payload === null) {
    return { printers: [] }
  }
  const record = payload as Record<string, unknown>
  const rawPrinters = Array.isArray(record.printers)
    ? record.printers
    : []

  const printers: PrinterJob[] = rawPrinters
    .map((rawPrinter): PrinterJob | null => {
      if (
        typeof rawPrinter !== "object" ||
        rawPrinter === null
      ) {
        return null
      }
      const printerRecord = rawPrinter as Record<
        string,
        unknown
      >
      const id = toTrimmedText(printerRecord.id)
      const name = toTrimmedText(printerRecord.name)
      const state = toPrinterJobState(printerRecord.state)
      if (!id || !name || !state) {
        return null
      }
      const rawPercent = toFiniteNumber(
        printerRecord.percent,
      )
      return dropUndefined({
        id,
        name,
        jobName: toTrimmedText(printerRecord.jobName) ?? "",
        percent: Math.min(
          100,
          Math.max(0, Math.round(rawPercent ?? 0)),
        ),
        state,
        currentLayer: toPositiveInteger(
          printerRecord.currentLayer,
        ),
        totalLayers: toPositiveInteger(
          printerRecord.totalLayers,
        ),
        remainingMinutes: toPositiveInteger(
          printerRecord.remainingMinutes,
        ),
        finishAtMs:
          toStartMs(printerRecord.finishAt) ?? undefined,
        thumbnailPath: toTrimmedText(
          printerRecord.thumbnailPath,
        ),
        filamentText: toTrimmedText(
          printerRecord.filamentText,
        ),
        filamentColor: toHexColor(
          printerRecord.filamentColor,
        ),
        nozzleText: toTrimmedText(printerRecord.nozzleText),
        problemText: toTrimmedText(
          printerRecord.problemText,
        ),
      })
    })
    .filter((printer): printer is PrinterJob =>
      Boolean(printer),
    )

  return { printers }
}
