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
  "time.v1",
] as const
/** An independently configured provider; secrets never belong in this DTO. */
export type SourceDefinition = {
  id: string
  name: string
  adapter: string
  settings: Record<string, unknown>
  isEnabled: boolean
}
/** A named, source-independent selection of typed data. */
export type ChannelDefinition = {
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
  id: string
  name: string
  layout: "single" | "split" | "grid"
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
  sessionMinutes?: number
  hasPin?: boolean
}
/** A stable URL whose current view can change through automation. */
export type ScreenDefinition = {
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
  state: z.enum(["preparing", "printing", "paused"]),
  currentLayer: finiteNumber.optional(),
  totalLayers: finiteNumber.optional(),
  remainingMinutes: finiteNumber.optional(),
  finishAtMs: finiteNumber.optional(),
  thumbnailPath: safeUrl.optional(),
  cameraPath: safeUrl.optional(),
  filamentText: z.string().optional(),
  filamentColor: z.string().optional(),
  nozzleText: z.string().optional(),
  problemText: z.string().optional(),
})
const ripBay = z.object({
  id: z.string(),
  name: z.string(),
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
const entity = z.object({
  id: z.string(),
  name: z.string(),
  state: z.string(),
  domain: z.string(),
  attributes: z.record(z.string(), z.unknown()),
  actions: z.array(z.string()),
})
/** Runtime schemas strip unknown fields before data reaches an extension. */
export const builtinContractSchemas = {
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
  "time.v1": z.object({ now: z.string() }),
} satisfies Record<string, z.ZodType>
/** Inferred consumer data for each built-in channel type. */
export type ContractData = {
  [ContractType in keyof typeof builtinContractSchemas]: z.infer<
    (typeof builtinContractSchemas)[ContractType]
  >
}
