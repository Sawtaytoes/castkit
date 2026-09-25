import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs"
import { dirname } from "node:path"
import type {
  ChannelDefinition,
  ScreenDefinition,
  SourceDefinition,
  ViewDefinition,
} from "@castkit/sdk/contracts"
import { z } from "zod"

const identifier = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*$/,
  )
  .max(160)
const targetIdentifier = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/)
  .max(100)
const settings = z.record(z.string(), z.unknown())
/** Server validation for every saved platform object. */
export const platformSchemas = {
  sources: z.object({
    id: targetIdentifier,
    name: z.string().min(1).max(120),
    adapter: z.string().min(1),
    settings,
    isEnabled: z.boolean(),
  }),
  channels: z.object({
    id: identifier,
    name: z.string().min(1).max(120),
    sourceId: targetIdentifier,
    type: z.string().min(1),
    settings,
  }),
  views: z.object({
    id: targetIdentifier,
    name: z.string().min(1).max(120),
    layout: z.enum(["single", "split", "grid"]),
    panels: z
      .array(
        z.object({
          id: targetIdentifier,
          specId: z.string().min(1),
          bindings: z.record(z.string(), identifier),
          settings,
        }),
      )
      .min(1)
      .max(24),
    theme: z.enum(["auto", "light", "dark"]),
    access: z.enum(["public", "pin"]),
    isControlEnabled: z.boolean(),
    appearance: z
      .object({
        fontFamily: z.string().max(160).optional(),
        accentColor: z.string().max(80).optional(),
        backgroundColor: z.string().max(80).optional(),
        textColor: z.string().max(80).optional(),
      })
      .optional(),
    sessionMinutes: z
      .number()
      .min(0)
      .max(525600)
      .optional(),
  }),
  screens: z.object({
    id: targetIdentifier,
    name: z.string().min(1).max(120),
    defaultViewId: targetIdentifier,
    viewIds: z.array(targetIdentifier).min(1).max(100),
    access: z.enum(["public", "pin"]),
    sessionMinutes: z
      .number()
      .min(0)
      .max(525600)
      .optional(),
  }),
}
type Grant = {
  kind: "view" | "screen"
  id: string
  expiresAt: number | null
}
type Session = {
  id: string
  isAdmin: boolean
  expiresAt: number | null
  grants: Grant[]
}
/** Private persisted state. Only public() may be serialized into an API response. */
export type PlatformState = {
  version: 1
  sources: SourceDefinition[]
  channels: ChannelDefinition[]
  views: ViewDefinition[]
  screens: ScreenDefinition[]
  secrets: Record<string, Record<string, string>>
  pinHashes: Record<string, string>
  adminHash?: string
  setupToken: string
  sessions: Session[]
  disabledPluginIds: string[]
  deviceScreens: Record<string, string>
}
/** Salted PIN digest; the original PIN is never persisted. */
export const hashPin = (pin: string) => {
  const salt = randomBytes(16).toString("hex")
  return `${salt}:${scryptSync(pin, salt, 32).toString("hex")}`
}
/** Compare a candidate without a value-dependent string comparison. */
export const verifyPin = ({
  pin,
  hash,
}: {
  pin: string
  hash?: string
}) => {
  if (!hash) return false
  const [salt, digest] = hash.split(":")
  if (!salt || !digest || !/^[a-f0-9]{64}$/.test(digest))
    return false
  return timingSafeEqual(
    Buffer.from(digest, "hex"),
    scryptSync(pin, salt, 32),
  )
}
/** Atomic disk-backed configuration. A missing file starts an empty installation. */
export const createPlatformStore = ({
  file,
}: {
  file?: string
} = {}) => {
  const state = {
    value: {
      version: 1,
      sources: [],
      channels: [],
      views: [],
      screens: [],
      secrets: {},
      pinHashes: {},
      setupToken: randomBytes(24).toString("hex"),
      sessions: [],
      disabledPluginIds: [],
      deviceScreens: {},
    } as PlatformState,
  }
  if (file && existsSync(file)) {
    const loaded = JSON.parse(
      readFileSync(file, "utf8"),
    ) as PlatformState
    if (loaded.version !== 1)
      throw new Error(
        "Unsupported CastKit platform file version",
      )
    Object.entries(platformSchemas).forEach(
      ([key, schema]) => {
        z.array(schema).parse(
          loaded[key as keyof typeof platformSchemas],
        )
      },
    )
    state.value = { ...state.value, ...loaded }
  }
  const update = (
    change: (previous: PlatformState) => PlatformState,
  ) => {
    const next = change(state.value)
    if (file) {
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(
        `${file}.next`,
        `${JSON.stringify(next, null, 2)}\n`,
        { mode: 0o600 },
      )
      renameSync(`${file}.next`, file)
    }
    state.value = next
  }
  if (file && !existsSync(file))
    update((previous) => previous)
  return {
    get: () => state.value,
    update,
    public: () => ({
      sources: state.value.sources.map((source) => ({
        ...source,
        configuredSecrets: Object.keys(
          state.value.secrets[source.id] ?? {},
        ),
      })),
      channels: state.value.channels,
      views: state.value.views.map((view) => ({
        ...view,
        hasPin: Boolean(
          state.value.pinHashes[`view:${view.id}`],
        ),
      })),
      screens: state.value.screens.map((screen) => ({
        ...screen,
        hasPin: Boolean(
          state.value.pinHashes[`screen:${screen.id}`],
        ),
      })),
      deviceScreens: state.value.deviceScreens,
    }),
  }
}
/** Storage contract used by the HTTP and runtime layers. */
export type PlatformStore = ReturnType<
  typeof createPlatformStore
>
