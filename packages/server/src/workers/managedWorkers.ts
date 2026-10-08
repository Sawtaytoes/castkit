import { spawn } from "node:child_process"
import { readFile } from "node:fs/promises"
import { dirname, isAbsolute, resolve } from "node:path"
import { z } from "zod"

const workerSchema = z.array(
  z.object({
    deviceId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    configPath: z.string().min(1),
  }),
)

/** Load private deployment connection files without copying credentials into the registry. */
export const readWorkerDefinitions = async ({
  file,
  deviceIds,
}: {
  file?: string
  deviceIds: readonly string[]
}) => {
  if (!file) return []
  const definitions = workerSchema.parse(
    JSON.parse(await readFile(file, "utf8")),
  )
  const ids = new Set(
    definitions.map(({ deviceId }) => deviceId),
  )
  if (ids.size !== definitions.length)
    throw new Error("Duplicate managed worker device")
  if (
    definitions.some(
      ({ deviceId }) => !deviceIds.includes(deviceId),
    )
  )
    throw new Error(
      "Managed worker refers to an unregistered device",
    )
  const paths = definitions.map(({ configPath }) =>
    isAbsolute(configPath)
      ? configPath
      : resolve(dirname(file), configPath),
  )
  if (new Set(paths).size !== paths.length)
    throw new Error(
      "Duplicate managed worker connection file",
    )
  await Promise.all(paths.map((path) => readFile(path)))
  return definitions.map((definition, index) => ({
    ...definition,
    configPath: paths[index]!,
  }))
}

/** Measure a worker's complete process tree; PSS apportions Chromium's shared pages. */
export const readProcessMemory = async (
  processId: number,
): Promise<{ rssBytes: number; pssBytes: number }> => {
  const [memory, children] = await Promise.all([
    readFile(
      `/proc/${processId}/smaps_rollup`,
      "utf8",
    ).catch(() => ""),
    readFile(
      `/proc/${processId}/task/${processId}/children`,
      "utf8",
    ).catch(() => ""),
  ])
  const readBytes = (name: string) =>
    Number(
      new RegExp(`^${name}:\\s+(\\d+)`, "m").exec(
        memory,
      )?.[1] ?? 0,
    ) * 1024
  const descendants = await Promise.all(
    children
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((child) => readProcessMemory(Number(child))),
  )
  return descendants.reduce(
    (total, child) => ({
      rssBytes: total.rssBytes + child.rssBytes,
      pssBytes: total.pssBytes + child.pssBytes,
    }),
    {
      rssBytes: readBytes("Rss"),
      pssBytes: readBytes("Pss"),
    },
  )
}

/** Supervise independent stream processes inside CastKit; one failed worker never restarts the server. */
export const startManagedWorkers = ({
  definitions,
  command = "/opt/castkit-worker/bin/python",
  script = "/app/device-client/remote-display/worker.py",
  restartDelayMs = 1000,
  log = console.log,
}: {
  definitions: Awaited<
    ReturnType<typeof readWorkerDefinitions>
  >
  command?: string
  script?: string
  restartDelayMs?: number
  log?: (message: string) => void
}) => {
  const lifecycle = { isStopped: false }
  const workers = definitions.map((definition) => ({
    ...definition,
    process: null as ReturnType<typeof spawn> | null,
    timer: undefined as
      | ReturnType<typeof setTimeout>
      | undefined,
    restarts: 0,
    failures: 0,
    startedAt: 0,
    peakPssBytes: 0,
    peakRssBytes: 0,
  }))
  const killTree = (
    processId: number,
    signal: NodeJS.Signals,
  ) => {
    try {
      process.kill(
        process.platform === "win32"
          ? processId
          : -processId,
        signal,
      )
    } catch {
      /* Already exited. */
    }
  }
  const launch = (worker: (typeof workers)[number]) => {
    if (lifecycle.isStopped) return
    const child = spawn(
      command,
      [script, "--config", worker.configPath],
      {
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      },
    )
    worker.process = child
    worker.startedAt = Date.now()
    log(`[castkit.worker:${worker.deviceId}] started`)
    const output = (chunk: Buffer) =>
      log(
        `[castkit.worker:${worker.deviceId}] ${String(chunk).trimEnd()}`,
      )
    child.stdout?.on("data", output)
    child.stderr?.on("data", output)
    child.once("error", () =>
      log(
        `[castkit.worker:${worker.deviceId}] process unavailable`,
      ),
    )
    child.once("exit", () => {
      if (child.pid) killTree(child.pid, "SIGKILL")
    })
    child.once("close", (code, signal) => {
      if (child.pid) killTree(child.pid, "SIGKILL")
      worker.process = null
      if (lifecycle.isStopped) return
      worker.failures =
        Date.now() - worker.startedAt > 60_000
          ? 1
          : worker.failures + 1
      const delayMs = Math.min(
        30_000,
        restartDelayMs *
          2 ** Math.min(worker.failures - 1, 5),
      )
      log(
        `[castkit.worker:${worker.deviceId}] exited (${code ?? signal}); retry in ${delayMs}ms`,
      )
      worker.timer = setTimeout(() => {
        worker.restarts += 1
        launch(worker)
      }, delayMs)
    })
  }
  workers.forEach(launch)
  const getStatus = async () =>
    Promise.all(
      workers.map(async (worker) => {
        const memory = worker.process?.pid
          ? await readProcessMemory(worker.process.pid)
          : { rssBytes: 0, pssBytes: 0 }
        worker.peakPssBytes = Math.max(
          worker.peakPssBytes,
          memory.pssBytes,
        )
        worker.peakRssBytes = Math.max(
          worker.peakRssBytes,
          memory.rssBytes,
        )
        return {
          deviceId: worker.deviceId,
          isRunning: Boolean(worker.process?.pid),
          processId: worker.process?.pid ?? null,
          restarts: worker.restarts,
          uptimeMs: worker.process
            ? Date.now() - worker.startedAt
            : 0,
          ...memory,
          peakPssBytes: worker.peakPssBytes,
          peakRssBytes: worker.peakRssBytes,
        }
      }),
    )
  const measurementTimer = setInterval(
    () => void getStatus(),
    10_000,
  )
  measurementTimer.unref()
  return {
    getStatus,
    stop: async () => {
      lifecycle.isStopped = true
      clearInterval(measurementTimer)
      await Promise.all(
        workers.map(async (worker) => {
          clearTimeout(worker.timer)
          const child = worker.process
          if (!child?.pid) return
          const closed = new Promise<void>((done) =>
            child.once("close", () => done()),
          )
          killTree(child.pid, "SIGTERM")
          const timeout = setTimeout(() => {
            if (child.pid) killTree(child.pid, "SIGKILL")
          }, 3000)
          await closed
          clearTimeout(timeout)
        }),
      )
    },
  }
}
