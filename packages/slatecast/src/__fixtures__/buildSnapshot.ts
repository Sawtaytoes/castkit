import type {
  BrowserDeviceProfile,
  BrowserDeviceSettings,
  ServerToClientMessage,
  ViewDataState,
} from "@castkit/shared/protocol/ws"
import type {
  NowPlayingData,
  QueueData,
} from "@castkit/shared/viewData/types"

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
