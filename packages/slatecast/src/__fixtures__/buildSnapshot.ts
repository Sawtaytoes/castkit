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
  PrinterJob,
  PrintersData,
  QueueData,
  WeatherData,
} from "@castkit/shared/viewData/types"

/** One hour in milliseconds — agenda fixtures are offsets from now. */
const HOUR_MILLIS = 60 * 60 * 1_000

/** A touch-capable color device — the Media Controls case. */
export const buildDeviceProfile = (
  overrides: Partial<BrowserDeviceProfile> = {},
) => ({
  id: "dev-square",
  label: "Dev Square",
  width: 720,
  height: 720,
  shape: "square" as const,
  hasTouch: true,
  hasViewDrawer: false,
  color: "full" as const,
  // Axis A panel facts. A live-browser LCD: instant, nothing between the
  // composited frame and the glass, and a stripe the renderer can use.
  delivery: "live-browser" as const,
  repaint: "instant" as const,
  hasPanelDithering: false,
  pixelGrid: "rgb-stripe" as const,
  externalViews: [],
  views: [
    { name: "Now Playing", clientId: "now-playing" },
    { name: "Clock", clientId: "clock" },
    { name: "Touch Test", clientId: "touch-test" },
  ],
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
  condition: "partlycloudy",
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

/**
 * One active printer, exactly as Home Assistant pushes it. The file name keeps
 * the slicer's `_-_` separators and its trailing printer name, because that is
 * what the card's shortener has to survive.
 */
export const buildPrinterJob = (
  overrides: Partial<PrinterJob> = {},
): PrinterJob => ({
  id: "magi",
  name: "Magi",
  jobName:
    "Touch_Display_2_-_Front_Frame_and_Stand_-_Matte_Black_-_Magi",
  percent: 41,
  state: "printing",
  currentLayer: 32,
  totalLayers: 334,
  remainingMinutes: 128,
  thumbnailPath: "/plate-magi.png",
  filamentText: "PLA Matte · AMS 3 slot 3",
  filamentColor: "#1c1c1c",
  nozzleText: "0.4 mm hardened steel",
  ...overrides,
})

/** Every printer that is printing right now. */
export const buildPrinters = (
  overrides: Partial<PrintersData> = {},
): PrintersData => ({
  printers: [buildPrinterJob()],
  ...overrides,
})

export const buildSnapshot = ({
  device = buildDeviceProfile(),
  settings = buildSettings(),
  view = "now-playing",
  data = { nowPlaying: buildNowPlaying() },
  buildId = "build-one",
}: {
  device?: BrowserDeviceProfile
  settings?: BrowserDeviceSettings
  view?: string
  data?: ViewDataState
  /** The SPA bundle the server is serving; a change reloads the panel. */
  buildId?: string | undefined
} = {}): Extract<
  ServerToClientMessage,
  { type: "snapshot" }
> => ({
  type: "snapshot",
  device,
  settings,
  view,
  data,
  buildId,
})
