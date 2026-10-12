import { randomUUID } from "node:crypto"
import {
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs"
import { z } from "zod"

const rectangleSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
})

const savedWindowSchema = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  displayId: z.number(),
  displayLabel: z.string(),
  displayBounds: rectangleSchema,
  windowBounds: rectangleSchema,
  isFullScreen: z.boolean(),
  zoomByView: z.record(z.string(), z.number().positive()),
})

/** One desktop window: a virtual device showing one CastKit page. */
export type SavedWindow = z.infer<typeof savedWindowSchema>

/** Everything the desktop app remembers between launches. */
export type DesktopState = {
  version: 1
  serverOrigin: string | null
  windows: SavedWindow[]
}

/** The state of a first launch: no server yet, no windows. */
export const defaultDesktopState: DesktopState = {
  version: 1,
  serverOrigin: null,
  windows: [],
}

const stateFileSchema = z.object({
  version: z.literal(1),
  serverOrigin: z.string().nullable(),
  windows: z.array(z.unknown()),
})

/**
 * Read a parsed state file. A window entry that does not validate is dropped
 * on its own, so one damaged entry does not cost every other window its
 * placement.
 */
export const parseDesktopState = (
  raw: unknown,
):
  | { state: DesktopState; droppedWindowCount: number }
  | { error: string } => {
  const parsed = stateFileSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.message }
  }
  const windows = parsed.data.windows
    .map((entry) => savedWindowSchema.safeParse(entry))
    .filter((result) => result.success)
    .map((result) => result.data)
  return {
    state: {
      version: 1,
      serverOrigin: parsed.data.serverOrigin,
      windows,
    },
    droppedWindowCount:
      parsed.data.windows.length - windows.length,
  }
}

/**
 * Load the state file. A missing file is a first launch. A file that is not
 * valid JSON or not a state file is moved aside to `<file>.corrupt` (so it can
 * still be recovered by hand) and the app starts from the defaults.
 */
export const loadDesktopState = (
  filePath: string,
): { state: DesktopState; problem: string | null } => {
  if (!existsSync(filePath)) {
    return { state: defaultDesktopState, problem: null }
  }
  const result = (() => {
    try {
      return parseDesktopState(
        JSON.parse(readFileSync(filePath, "utf8")),
      )
    } catch (error) {
      return { error: String(error) }
    }
  })()
  if ("error" in result) {
    renameSync(filePath, `${filePath}.corrupt`)
    return {
      state: defaultDesktopState,
      problem: `The saved state at ${filePath} could not be read and was moved to ${filePath}.corrupt: ${result.error}`,
    }
  }
  return {
    state: result.state,
    problem:
      result.droppedWindowCount > 0
        ? `${result.droppedWindowCount} saved window(s) in ${filePath} were invalid and were skipped.`
        : null,
  }
}

/**
 * Write the state file atomically: a crash or a power cut mid-write leaves
 * either the old file or the new one, never half of each, because the new
 * contents go to a temporary file that is then renamed over the old one.
 */
export const saveDesktopState = ({
  filePath,
  state,
}: {
  filePath: string
  state: DesktopState
}) => {
  const temporaryPath = `${filePath}.${process.pid}.tmp`
  writeFileSync(
    temporaryPath,
    `${JSON.stringify(state, null, 2)}\n`,
    "utf8",
  )
  renameSync(temporaryPath, filePath)
}

/** A new window's id. It names the window's session partition too. */
export const createWindowId = () =>
  `window-${randomUUID().slice(0, 8)}`
