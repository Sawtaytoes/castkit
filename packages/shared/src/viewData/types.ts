/**
 * The view-data shapes Home Assistant PUSHES to CastKit over MQTT
 * (`<base>/<device>/{now_playing,queue,weather,agenda}/set`). CastKit never
 * reads HA — it renders whatever HA hands it. Both client modes consume these:
 * image mode at server render time, browser mode via the WebSocket snapshot.
 * See docs/decisions/2026-07-04-inkcast-renders-ha-pushed-data-not-reads-ha.md.
 */

export type NowPlayingData = {
  artist: string
  title: string
  album?: string
  isPlaying: boolean
  /** Artwork URL (album art / Plex poster) HA pushed, if any. */
  artworkPath?: string
  /** The artwork fetched + inlined for the image-mode render engines. */
  artworkDataUri?: string
  /**
   * Interactive-controller fields (browser mode). All optional so the original
   * minimal e-ink payload stays valid. The client computes live position as
   * `position + (now − positionUpdatedAt)` while playing — HA republishes on
   * change only, never per-second.
   */
  /** Track position in seconds, as of `positionUpdatedAtMs`. */
  positionSeconds?: number
  /** Epoch ms the position was measured (HA `media_position_updated_at`). */
  positionUpdatedAtMs?: number
  /** Track length in seconds. */
  durationSeconds?: number
  /** Player volume 0.0–1.0. */
  volume?: number
  isMuted?: boolean
}

/** One entry in the play queue, as pushed by Home Assistant. */
export type QueueItem = {
  title: string
  artist: string
  /** Artwork URL, if any. */
  artworkPath?: string
  /** Track length in seconds, if known. */
  durationSeconds?: number
  isCurrent: boolean
}

/** The play queue for the queue view (current + upcoming, capped upstream). */
export type QueueData = {
  items: readonly QueueItem[]
}

/** Current-weather data for the weather-bearing views, pushed by HA. */
export type WeatherData = {
  /** e.g. "79°" */
  temperatureText: string
  /** e.g. "Partly cloudy" */
  conditionText: string
}

/** One calendar event on the agenda view, as pushed by Home Assistant. */
export type AgendaEvent = {
  /**
   * Event start, epoch ms. Stored numeric (not pre-formatted) so consumers
   * format the time per panel size and re-filter "upcoming" on each minute
   * tick without a refetch.
   */
  startMs: number
  summary: string
  /** All-day events carry a date but no wall-clock time. */
  isAllDay: boolean
}

/**
 * Today's calendar agenda — the full day's events sorted ascending by start.
 * Consumers filter to upcoming and slice to their event budget at render time.
 */
export type AgendaData = {
  events: readonly AgendaEvent[]
}
