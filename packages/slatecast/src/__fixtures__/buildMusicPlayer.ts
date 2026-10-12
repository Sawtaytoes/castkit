import type {
  MusicPlayerData,
  MusicQueueItem,
} from "../views/musicPlayerModel.ts"

const ARTWORK = [
  "/sample-photos/landscape-color.jpg",
  "/sample-photos/landscape-gradient.jpg",
  "/sample-photos/landscape-highcontrast.jpg",
  "/sample-photos/landscape-neutral-text.jpg",
]

/** Invented titles and artists; nothing here names a real recording. */
const TRACKS = [
  ["Harbor Lights", "The Paper Kites Ensemble"],
  ["Northbound", "Ada Marlow"],
  ["Copper Sky", "Glass Orchard"],
  ["Morning Static", "The Lanterns"],
  ["Slow River", "Ada Marlow"],
  ["Field Notes", "Quiet Engine"],
  ["Long Way Round", "The Lanterns"],
  ["Paper Planes Over Ninth Street", "Glass Orchard"],
  ["Undertow", "Mira Sol"],
  ["A Very Long Title That Needs To Be Cut Short On A Small Display", "An Artist With An Equally Long Name"],
  ["Tidewater", "Quiet Engine"],
  ["Last Light", "Mira Sol"],
  ["Small Hours", "The Paper Kites Ensemble"],
  ["Echo Park", "Ada Marlow"],
  ["Static Bloom", "Glass Orchard"],
] as const

/** One invented queue row at `index`. */
export const buildQueueItem = (index: number): MusicQueueItem => {
  const [title, artist] = TRACKS[index % TRACKS.length] ?? [
    "Untitled",
    "Unknown",
  ]
  return {
    queueItemId: `row-${index}`,
    index,
    title,
    artist,
    album: "Sample Sessions",
    durationSeconds: 150 + ((index * 37) % 120),
    artworkPath: ARTWORK[index % ARTWORK.length],
    isAvailable: true,
  }
}

/** A deterministic loudness curve with a quiet intro and a loud middle. */
export const buildWaveform = (count = 300) =>
  Array.from({ length: count }, (_, index) => {
    const envelope =
      0.35 + 0.65 * Math.sin((Math.PI * index) / count)
    const ripple = 0.55 + 0.45 * Math.abs(Math.sin(index * 1.7))
    return Math.round(envelope * ripple * 1000) / 1000
  })

/** Original placeholder lines, timed every five seconds from 0:05. */
export const SYNCED_LYRICS: NonNullable<
  MusicPlayerData["lyrics"]
> = {
  isSynced: true,
  lines: [
    "Placeholder line for the opening verse",
    "A second line that follows the first",
    "The words here only test the layout",
    "This is the line being sung right now",
    "And this one waits for its turn",
    "Then a chorus line that repeats",
    "Another line to fill the screen",
    "The final placeholder line",
  ].map((text, index) => ({
    startSeconds: 5 + index * 5,
    text,
  })),
}

/**
 * A playing group with a 120-track queue, the current track at index 12,
 * the waveform, and synced lyrics. `nowMs` pins the position so a frozen
 * clock draws the same frame every time.
 */
export const buildMusicPlayer = ({
  nowMs,
  currentIndex = 12,
  state = "playing",
  positionSeconds = 22,
  overrides = {},
}: {
  nowMs: number
  currentIndex?: number
  state?: "playing" | "paused" | "idle" | "unavailable"
  positionSeconds?: number
  overrides?: Partial<MusicPlayerData>
}): MusicPlayerData => {
  const items = Array.from({ length: 44 }, (_, offset) =>
    buildQueueItem(Math.max(0, currentIndex - 3) + offset),
  )
  const current = items.find(
    (item) => item.index === currentIndex,
  )
  return {
    player: {
      id: "desk-group",
      name: "Desk Speakers",
      state,
      volume: 45,
      isMuted: false,
      isGroup: true,
      isMemberControlAvailable: true,
      members: [
        {
          id: "desk-left",
          name: "Desk Left",
          isMember: true,
          isAvailable: true,
        },
        {
          id: "desk-right",
          name: "Desk Right",
          isMember: true,
          isAvailable: true,
        },
        {
          id: "shelf",
          name: "Shelf Speaker",
          isMember: false,
          isAvailable: true,
        },
        {
          id: "porch",
          name: "Porch Speaker",
          isMember: false,
          isAvailable: false,
        },
      ],
    },
    players: [
      {
        id: "desk-group",
        name: "Desk Speakers",
        state,
        isGroup: true,
      },
      {
        id: "desk-left",
        name: "Desk Left",
        state: "idle",
        isGroup: false,
      },
    ],
    isAutomaticSelection: true,
    queue: {
      id: "desk-group",
      itemCount: 120,
      currentIndex,
      isShuffled: false,
      repeat: "all",
      items,
    },
    ...(current
      ? { current: { ...current, isFavorite: true } }
      : {}),
    positionSeconds,
    positionUpdatedAtMs: nowMs,
    waveform: buildWaveform(),
    lyrics: SYNCED_LYRICS,
    ...overrides,
  }
}
