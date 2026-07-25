import type {
  BrowserDeviceProfile,
  BrowserDeviceSettings,
  ServerToClientMessage,
  ViewDataState,
} from "@castkit/shared/protocol/ws"
import type {
  AgendaData,
  AgendaEvent,
  NowPlayingData,
  QueueData,
  WeatherData,
} from "@castkit/shared/viewData/types"

/** One hour in milliseconds — agenda fixtures are offsets from now. */
const HOUR_MILLIS = 60 * 60 * 1_000

/** A touch-capable colour device — the Media Controls case. */
export const buildDeviceProfile = (
  overrides: Partial<BrowserDeviceProfile> = {},
) => ({
  id: "dev-square",
  label: "Dev Square",
  width: 720,
  height: 720,
  shape: "square" as const,
  hasTouch: true,
  colour: "full" as const,
  ...overrides,
})

export const buildSettings = (
  overrides: Partial<BrowserDeviceSettings> = {},
) => ({
  orientation: 0 as const,
  theme: "Dark" as const,
  photoIntervalMinutes: 10,
  ...overrides,
})

/**
 * Position fields are stamped relative to a caller-supplied `positionUpdatedAtMs`
 * rather than `Date.now()`, so a test can assert an exact rendered seek time.
 */
export const buildNowPlaying = (
  overrides: Partial<NowPlayingData> = {},
): NowPlayingData => ({
  artist: "Boards of Canada",
  title: "Roygbiv",
  album: "Music Has the Right to Children",
  isPlaying: true,
  positionSeconds: 30,
  positionUpdatedAtMs: Date.now(),
  durationSeconds: 151,
  volume: 0.5,
  isMuted: false,
  ...overrides,
})

export const buildQueue = (
  overrides: Partial<QueueData> = {},
): QueueData => ({
  items: [
    {
      title: "Roygbiv",
      artist: "Boards of Canada",
      durationSeconds: 151,
      isCurrent: true,
    },
    {
      title: "Olson",
      artist: "Boards of Canada",
      durationSeconds: 90,
      isCurrent: false,
    },
  ],
  ...overrides,
})

/** Current weather exactly as Home Assistant pushes it — pre-formatted text. */
export const buildWeather = (
  overrides: Partial<WeatherData> = {},
): WeatherData => ({
  temperatureText: "72°",
  conditionText: "Partly cloudy",
  ...overrides,
})

/**
 * One calendar row. `startMs` is stamped an hour ahead of now so the fixture
 * survives the view's upcoming filter; tests that exercise the in-progress
 * grace window pass their own offset from `Date.now()`.
 */
export const buildAgendaEvent = (
  overrides: Partial<AgendaEvent> = {},
): AgendaEvent => ({
  startMs: Date.now() + HOUR_MILLIS,
  summary: "Dentist appointment",
  isAllDay: false,
  ...overrides,
})

/** Today's agenda, sorted ascending, exactly as Home Assistant pushes it. */
export const buildAgenda = (
  overrides: Partial<AgendaData> = {},
): AgendaData => ({
  events: [
    buildAgendaEvent(),
    buildAgendaEvent({
      summary: "Grocery delivery",
      startMs: Date.now() + 3 * HOUR_MILLIS,
    }),
  ],
  ...overrides,
})

export const buildSnapshot = ({
  device = buildDeviceProfile(),
  settings = buildSettings(),
  view = "now-playing",
  data = { nowPlaying: buildNowPlaying() },
}: {
  device?: BrowserDeviceProfile
  settings?: BrowserDeviceSettings
  view?: string
  data?: ViewDataState
} = {}): ServerToClientMessage => ({
  type: "snapshot",
  device,
  settings,
  view,
  data,
})
