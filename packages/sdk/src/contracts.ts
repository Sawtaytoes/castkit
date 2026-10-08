import { z } from "zod"

/** Stable names for the versioned data contracts shared by every renderer. */
export const CONTRACT_TYPES = [
  "now-playing.v1",
  "queue.v1",
  "printers.v1",
  "rip-deck.v1",
  "agenda.v1",
  "images.v1",
  "weather.v1",
  "entities.v1",
  "cameras.v1",
  "points.v1",
  "kids-points.v1",
  "points-history.v1",
  "ai-usage.v1",
  "time.v1",
  "spools.v1",
  "ams.v1",
  "cutters.v1",
] as const
/** An independently configured provider; secrets never belong in this DTO. */
export type SourceDefinition = {
  tags?: string[]
  id: string
  name: string
  adapter: string
  settings: Record<string, unknown>
  isEnabled: boolean
}
/** A named, source-independent selection of typed data. */
export type ChannelDefinition = {
  tags?: string[]
  id: string
  name: string
  sourceId: string
  type: string
  settings: Record<string, unknown>
}
/** Last valid channel value plus availability. */
export type ChannelSnapshot = {
  id: string
  type: string
  data: unknown
  status: "waiting" | "ready" | "stale" | "error"
  updatedAt?: string
  error?: string
}
/** Input bindings and presentation settings for one component. */
export type ViewPanel = {
  id: string
  specId: string
  bindings: Record<string, string>
  settings: Record<string, unknown>
}
/** A reusable composition that can be assigned to any compatible display. */
export type ViewDefinition = {
  tags?: string[]
  id: string
  name: string
  layout:
    | "single"
    | "split"
    | "grid"
    | "cards"
    | "rail"
    | "adaptive"
  panels: ViewPanel[]
  theme: "auto" | "light" | "dark"
  appearance?: {
    fontFamily?: string
    accentColor?: string
    backgroundColor?: string
    textColor?: string
  }
  access: "public" | "pin"
  isControlEnabled: boolean
  /**
   * Show only the panels that have something active, and one line when none
   * has: no rip running, every plate cleared, nothing playing. The server
   * answers activity per panel from the bound channel's data (see
   * `viewActivity.ts`); a panel whose contract has no idle state is always
   * active.
   */
  isActiveOnly?: boolean
  sessionMinutes?: number
  hasPin?: boolean
}
/** A stable URL whose current view can change through automation. */
export type ScreenDefinition = {
  tags?: string[]
  id: string
  name: string
  defaultViewId: string
  viewIds: string[]
  activeViewId?: string
  access: "public" | "pin"
  sessionMinutes?: number
  hasPin?: boolean
}

const safeUrl = z
  .string()
  .refine(
    (value) =>
      (value.startsWith("/") && !value.startsWith("//")) ||
      /^https?:\/\//i.test(value),
    "Expected an HTTP URL or an origin-relative path",
  )
const finiteNumber = z.number().finite()
const nowPlaying = z.object({
  artist: z.string(),
  entityId: z.string().optional(),
  title: z.string(),
  album: z.string().optional(),
  isPlaying: z.boolean(),
  artworkPath: safeUrl.optional(),
  positionSeconds: finiteNumber.optional(),
  positionUpdatedAtMs: finiteNumber.optional(),
  durationSeconds: finiteNumber.optional(),
  volume: finiteNumber.min(0).max(1).optional(),
  isMuted: z.boolean().optional(),
})
const printer = z.object({
  id: z.string(),
  name: z.string(),
  jobName: z.string(),
  percent: finiteNumber.min(0).max(100),
  state: z.enum([
    "preparing",
    "printing",
    "paused",
    "finished",
    "failed",
  ]),
  currentLayer: finiteNumber.optional(),
  totalLayers: finiteNumber.optional(),
  remainingMinutes: finiteNumber.optional(),
  finishAtMs: finiteNumber.optional(),
  thumbnailPath: safeUrl.optional(),
  cameraPath: safeUrl.optional(),
  cameraIsLive: z.boolean().optional(),
  cameraFormat: z.enum(["hls", "mjpeg"]).optional(),
  filamentText: z.string().optional(),
  filamentColor: z.string().optional(),
  filaments: z
    .array(
      z.object({
        name: z.string().optional(),
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/)
          .optional(),
        colorName: z.string().optional(),
        rgba: z
          .string()
          .regex(/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/)
          .optional(),
        extraColors: z
          .array(
            z
              .string()
              .regex(/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/),
          )
          .optional(),
        effectType: z.string().optional(),
        brand: z.string().optional(),
        location: z.string(),
      }),
    )
    .max(32)
    .optional(),
  nozzleText: z.string().optional(),
  problemText: z.string().optional(),
})
const ripBay = z.object({
  id: z.string(),
  name: z.string(),
  slotNumber: finiteNumber.int().positive().optional(),
  state: z.string(),
  title: z.string(),
  percent: finiteNumber.min(0).max(100),
  remainingSeconds: finiteNumber.optional(),
  posterUrl: safeUrl.optional(),
  problemText: z.string().optional(),
  actions: z.array(z.string()),
  hasDisc: z.boolean(),
  isPresent: z.boolean(),
  isQuarantined: z.boolean(),
  lastTrayCommand: z.string().optional(),
  jobId: z.string().optional(),
  phase: z.string().optional(),
  outcome: z.string().optional(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
})
/**
 * One quota window of one AI subscription — a five-hour session limit, a weekly
 * limit, a monthly allowance.
 *
 * `percentUsed` is optional because a provider can report that a window exists
 * and still not say how much of it is gone. A window with no percentage is
 * drawn as a labelled row without a bar, which is more honest than a bar at
 * zero.
 */
const usageWindow = z.object({
  id: z.string(),
  label: z.string(),
  percentUsed: finiteNumber.min(0).max(100).optional(),
  resetsAtMs: finiteNumber.optional(),
  usedText: z.string().optional(),
  /**
   * How long the window itself is, which is NOT derivable from `resetsAtMs`.
   * A reset time says when the counter next clears; it says nothing about the
   * span being counted. A five-hour session window one minute old resets
   * further out than a weekly window on its last day, so ordering by reset
   * time puts the session limit above the weekly one roughly half the time.
   *
   * The view reads this to decide which window is the provider's headline.
   * Optional because a provider may describe a window we cannot classify, and
   * an unclassified window is better than a guessed one.
   */
  periodHours: finiteNumber.positive().optional(),
})
const usageProvider = z.object({
  id: z.string(),
  name: z.string(),
  windows: z.array(usageWindow),
  isOk: z.boolean(),
  planText: z.string().optional(),
  problemText: z.string().optional(),
  /** The producer served its last good answer while the provider was unreachable. */
  isCached: z.boolean().optional(),
})
/**
 * One child on a household points board: what they have today against the
 * day's goal. `color` is the identity color the household already uses for
 * that child (their cards, their charts); the view draws it as a stripe and a
 * bar, never as text, because a pale identity color is unreadable as type on
 * a light scheme.
 */
const kidPoints = z.object({
  id: z.string(),
  /** Zero-based manual order supplied by the points producer. */
  displayOrder: finiteNumber.int().nonnegative().optional(),
  name: z.string(),
  pointsToday: finiteNumber,
  goal: finiteNumber.positive().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  lastTask: z.string().optional(),
  /** Producer-local day and timezone for the complete daily task snapshot. */
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  timeZone: z.string().optional(),
  /** Completed task entries; the producer excludes voids and reversed awards. */
  tasksToday: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().min(1),
        atMs: finiteNumber,
        points: finiteNumber,
        minutes: finiteNumber.nonnegative().optional(),
      }),
    )
    .optional(),
  /** A timed card that is running now, and when it started. */
  activeTask: z
    .object({
      name: z.string(),
      startedAtMs: finiteNumber,
      /** Reader where this timed activity started. */
      reader: z.string().optional(),
      goalMinutes: finiteNumber.positive().optional(),
      isCountdown: z.boolean().optional(),
    })
    .optional(),
})
/**
 * The most recent card scan. `result` is the producer's outcome reduced to
 * the four things a display draws differently: points paid, a refusal (too
 * early, already done), and a timer starting or stopping.
 */
const kidScan = z.object({
  kidId: z.string(),
  result: z.enum([
    "awarded",
    "refused",
    "started",
    "stopped",
    "progress",
  ]),
  points: finiteNumber,
  taskName: z.string().optional(),
  message: z.string().optional(),
  reader: z.string().optional(),
  atMs: finiteNumber,
})
const entity = z.object({
  id: z.string(),
  name: z.string(),
  state: z.string(),
  domain: z.string(),
  attributes: z.record(z.string(), z.unknown()),
  actions: z.array(z.string()),
})
/** Runtime schemas strip unknown fields before data reaches an extension. */

const hexColor = z
  .string()
  .regex(
    /^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/,
    "Expected 6 or 8 hex digits",
  )
/**
 * One inventory spool. `remainingGrams` is the dashboard's own count
 * (label weight minus what it has charged), never the scale; the scale is a
 * separate fact on the channel and the view shows the two side by side.
 * `rgba` keeps its alpha: below `FF` the filament is translucent and a swatch
 * draws it on a checkerboard.
 */
const spool = z.object({
  id: z.string(),
  brand: z.string().optional(),
  material: z.string(),
  subtype: z.string().optional(),
  colorName: z.string().optional(),
  rgba: hexColor.optional(),
  extraColors: z.array(hexColor).optional(),
  effectType: z.string().optional(),
  labelWeightGrams: finiteNumber,
  coreWeightGrams: finiteNumber,
  remainingGrams: finiteNumber,
  lastScaleGrams: finiteNumber.optional(),
  lastWeighedAtMs: finiteNumber.optional(),
  tagUid: z.string().optional(),
  trayUuid: z.string().optional(),
  tagType: z.string().optional(),
  location: z
    .object({
      printerId: z.string(),
      printerName: z.string(),
      amsId: finiteNumber,
      trayId: finiteNumber,
    })
    .optional(),
})
/**
 * One AMS tray. `read` is a spool the source identified from either the AMS
 * tag or its inventory assignment; `untagged` is a spool the AMS can see but
 * the source cannot identify, which is not the same thing as `empty`, a slot
 * with nothing in it.
 */
const amsTray = z.object({
  id: finiteNumber,
  state: z.enum(["read", "untagged", "empty"]),
  material: z.string().optional(),
  subtype: z.string().optional(),
  colorName: z.string().optional(),
  rgba: hexColor.optional(),
  remainPercent: finiteNumber.optional(),
  spoolId: z.string().optional(),
  kValue: finiteNumber.nonnegative().optional(),
})
const amsUnit = z.object({
  id: finiteNumber,
  label: z.string(),
  humidityPercent: finiteNumber.optional(),
  temperatureCelsius: finiteNumber.optional(),
  trays: z.array(amsTray),
})
const spoolsPrinter = z.object({
  id: z.string(),
  name: z.string(),
  isOnline: z.boolean(),
  model: z.string().optional(),
  imagePath: safeUrl.optional(),
  ams: z.array(amsUnit),
})
/**
 * SVG path data and nothing else: commands, numbers, separators. A cut
 * preview is drawn as `<path d>` attributes, never as markup, so a source
 * cannot smuggle an element or a script into the panel.
 */
const svgPathData = z
  .string()
  .max(200_000)
  .regex(/^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\s-]*$/)
/**
 * One send to a vinyl or paper cutter. The cutter reports nothing back once
 * the bytes are in its buffer, so `expectedDoneAtMs` is the source's ESTIMATE
 * of when the blade stops, and a `done` job is finished by that estimate, not
 * by anything the machine said. `isTrace` is a blade-up outline move.
 */
const cutterJob = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum([
    "queued",
    "sent",
    "cutting",
    "done",
    "failed",
    "canceled",
  ]),
  isTrace: z.boolean(),
  createdAtMs: finiteNumber,
  writtenAtMs: finiteNumber.optional(),
  expectedDoneAtMs: finiteNumber.optional(),
  finishedAtMs: finiteNumber.optional(),
  estimateSeconds: finiteNumber.nonnegative().optional(),
  cutLengthMm: finiteNumber.nonnegative().optional(),
  problemText: z.string().optional(),
  preview: z
    .object({
      sheet: z.object({
        widthMm: finiteNumber.positive(),
        heightMm: finiteNumber.positive(),
      }),
      boundsMm: z.object({
        x: finiteNumber,
        y: finiteNumber,
        width: finiteNumber.nonnegative(),
        height: finiteNumber.nonnegative(),
      }),
      paths: z
        .array(
          z.object({
            d: svgPathData,
            kind: z.enum(["cut", "weedbox", "outline"]),
          }),
        )
        .max(4000),
    })
    .optional(),
})
/**
 * One cutter on one USB cable. `isOnline` is the host that drives it;
 * `isCutterConnected` is the machine itself answering on that cable, so a
 * cutter that is switched off reads online and not connected.
 */
const cutter = z.object({
  id: z.string(),
  name: z.string(),
  hostLabel: z.string().optional(),
  firmwareVersion: z.string().optional(),
  isOnline: z.boolean(),
  isCutterConnected: z.boolean(),
  updatedAtMs: finiteNumber.optional(),
  imagePath: safeUrl.optional(),
  currentJob: cutterJob.optional(),
  recentJobs: z.array(cutterJob).max(10),
})
export const builtinContractSchemas = {
  "ams.v1": z.object({ printers: z.array(spoolsPrinter) }),
  "cutters.v1": z.object({ cutters: z.array(cutter) }),
  "now-playing.v1": nowPlaying,
  "queue.v1": z.object({
    items: z.array(
      z.object({
        title: z.string(),
        artist: z.string(),
        artworkPath: safeUrl.optional(),
        durationSeconds: finiteNumber.optional(),
        isCurrent: z.boolean(),
      }),
    ),
  }),
  "printers.v1": z.object({ printers: z.array(printer) }),
  "rip-deck.v1": z.object({
    bays: z.array(ripBay),
    alerts: z.array(
      z.object({
        message: z.string(),
        confidence: z.string().optional(),
        driveIds: z.array(z.string()),
      }),
    ),
    isPresent: z.boolean(),
    activeCount: finiteNumber,
    loadedDiscCount: finiteNumber,
  }),
  "agenda.v1": z.object({
    events: z.array(
      z.object({
        startMs: finiteNumber,
        summary: z.string(),
        isAllDay: z.boolean(),
      }),
    ),
  }),
  "images.v1": z.object({
    images: z.array(
      z.object({
        id: z.string(),
        url: safeUrl,
        title: z.string().optional(),
        width: finiteNumber.optional(),
        height: finiteNumber.optional(),
        faces: z
          .array(
            z.object({
              x1: finiteNumber,
              y1: finiteNumber,
              x2: finiteNumber,
              y2: finiteNumber,
            }),
          )
          .optional(),
      }),
    ),
  }),
  "weather.v1": z.object({
    temperatureText: z.string(),
    conditionText: z.string(),
    condition: z.string().optional(),
    temperatureUnit: z.string().optional(),
    precipitationUnit: z.string().optional(),
    forecast: z
      .array(
        z.object({
          datetime: z.string(),
          temperature: finiteNumber,
          temperatureLow: finiteNumber.optional(),
          precipitationProbability: finiteNumber.optional(),
          precipitation: finiteNumber.optional(),
          condition: z.string().optional(),
        }),
      )
      .optional(),
  }),
  "entities.v1": z.object({ entities: z.array(entity) }),
  "cameras.v1": z.object({
    cameras: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        url: safeUrl,
        isLive: z.boolean().optional(),
        format: z.enum(["hls", "mjpeg"]).optional(),
      }),
    ),
  }),
  "points.v1": z
    .object({
      name: z.string(),
      total: finiteNumber.optional(),
      pointsToday: finiteNumber.optional(),
      awarded: finiteNumber.optional(),
      message: z.string().optional(),
      expiresAt: z.string().optional(),
    })
    .refine(
      (value) =>
        value.total !== undefined ||
        value.pointsToday !== undefined,
      "A points result requires the account total or today's points.",
    ),
  "kids-points.v1": z.object({
    kids: z.array(kidPoints),
    lastScan: kidScan.optional(),
    timerScans: z.array(kidScan).optional(),
  }),
  "points-history.v1": z.object({
    version: z.literal(1),
    generatedAtMs: finiteNumber,
    range: z.object({
      fromDay: z.string(),
      toDay: z.string(),
      dayCount: finiteNumber.int().min(1).max(366),
      timezone: z.string(),
      isPartial: z.boolean(),
    }),
    source: z.object({
      name: z.enum(["influxdb", "sqlite"]),
      isFallback: z.boolean(),
      message: z.string().nullable(),
    }),
    children: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        color: z.string(),
        pointsToday: finiteNumber,
        goalToday: finiteNumber,
        lifetimeEarned: finiteNumber,
        spendable: finiteNumber,
        totals: z.object({
          net: finiteNumber,
          previousNet: finiteNumber,
          averagePerCalendarDay: finiteNumber,
          averagePerActiveDay: finiteNumber.nullable(),
          activeDays: finiteNumber,
          qualifyingDays: finiteNumber,
          bonusPercent: finiteNumber.nullable(),
          pointsToPenaltyRatio: finiteNumber.nullable(),
        }),
        days: z
          .array(
            z.object({
              day: z.string(),
              goal: finiteNumber,
              net: finiteNumber,
              chores: finiteNumber,
              bonus: finiteNumber,
              penalty: finiteNumber,
              reversals: finiteNumber,
              cumulative: finiteNumber,
              minutes: z.record(z.string(), finiteNumber),
            }),
          )
          .max(366),
        tasks: z.array(
          z.object({
            key: z.string(),
            name: z.string(),
            points: finiteNumber,
            minutes: finiteNumber,
            averageMinutesPerCalendarDay: finiteNumber,
            days: z
              .array(
                z.object({
                  day: z.string(),
                  points: finiteNumber,
                  minutes: finiteNumber,
                }),
              )
              .max(366),
          }),
        ),
      }),
    ),
  }),
  "ai-usage.v1": z.object({
    providers: z.array(usageProvider),
    fetchedAtMs: finiteNumber.optional(),
    isMock: z.boolean().optional(),
  }),
  "time.v1": z.object({ now: z.string() }),
  /**
   * A filament scale with a tag reader beside a fleet of printers. The scale
   * and the tag are live facts from the reader; the spools and the printers'
   * AMS trays are the dashboard's inventory, polled. A `tag.state` of `none`
   * means nothing is on the reader; `unknown` is a tag the inventory has never
   * seen, which is what the copy-to-tag action exists for.
   */
  "spools.v1": z.object({
    scale: z.object({
      grams: finiteNumber,
      isStable: z.boolean(),
      isOnline: z.boolean(),
      updatedAtMs: finiteNumber.optional(),
    }),
    tag: z.object({
      state: z.enum(["none", "matched", "unknown"]),
      uid: z.string().optional(),
      tagType: z.string().optional(),
      trayUuid: z.string().optional(),
      spoolId: z.string().optional(),
      updatedAtMs: finiteNumber.optional(),
    }),
    spools: z.array(spool),
    printers: z.array(spoolsPrinter),
  }),
} satisfies Record<string, z.ZodType>
/** Inferred consumer data for each built-in channel type. */
export type ContractData = {
  [ContractType in keyof typeof builtinContractSchemas]: z.infer<
    (typeof builtinContractSchemas)[ContractType]
  >
}
