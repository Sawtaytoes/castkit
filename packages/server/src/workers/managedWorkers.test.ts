import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, onTestFinished, test } from "vitest"
import {
  readProcessMemory,
  readWorkerDefinitions,
  startManagedWorkers,
} from "./managedWorkers.ts"

const fixture = async (source: string) => {
  const directory = await mkdtemp(
    join(tmpdir(), "castkit-workers-"),
  )
  const script = join(directory, "worker.cjs")
  await writeFile(script, source)
  return { directory, script }
}

test("connection files must belong to registered unique displays", async () => {
  const { directory } = await fixture("")
  const file = join(directory, "workers.json")
  await writeFile(
    join(directory, "display.yaml"),
    "transport: presto",
  )
  await writeFile(
    file,
    JSON.stringify([
      {
        deviceId: "test-display",
        configPath: "display.yaml",
      },
    ]),
  )
  expect(
    await readWorkerDefinitions({
      file,
      deviceIds: ["test-display"],
    }),
  ).toEqual([
    {
      deviceId: "test-display",
      configPath: join(directory, "display.yaml"),
    },
  ])
  await expect(
    readWorkerDefinitions({ file, deviceIds: [] }),
  ).rejects.toThrow("unregistered device")
  await writeFile(
    file,
    JSON.stringify([
      {
        deviceId: "test-display",
        configPath: "display.yaml",
      },
      {
        deviceId: "test-display",
        configPath: "display.yaml",
      },
    ]),
  )
  await expect(
    readWorkerDefinitions({
      file,
      deviceIds: ["test-display"],
    }),
  ).rejects.toThrow("Duplicate")
  expect(
    await readWorkerDefinitions({ deviceIds: [] }),
  ).toEqual([])
})

test("one failing worker restarts independently and stop prevents further launches", async () => {
  const { directory, script } = await fixture(
    "const path=require('node:process').argv.at(-1); if(path.endsWith('failing')) setTimeout(()=>process.exit(1),30); else setInterval(()=>{},1000)",
  )
  const logs: string[] = []
  const supervisor = startManagedWorkers({
    definitions: [
      {
        deviceId: "failing",
        configPath: join(directory, "failing"),
      },
      {
        deviceId: "healthy",
        configPath: join(directory, "healthy"),
      },
    ],
    command: process.execPath,
    script,
    restartDelayMs: 20,
    log: (message) => logs.push(message),
  })
  onTestFinished(() => supervisor.stop())
  await expect
    .poll(
      async () =>
        (await supervisor.getStatus())[0]?.restarts,
      { timeout: 5000 },
    )
    .toBeGreaterThan(1)
  const healthy = (await supervisor.getStatus())[1]!
  expect(healthy.isRunning).toBe(true)
  expect(healthy.restarts).toBe(0)
  if (process.platform === "linux") {
    expect(healthy.pssBytes).toBeGreaterThan(0)
    expect(healthy.peakPssBytes).toBeGreaterThanOrEqual(
      healthy.pssBytes,
    )
  }
  await supervisor.stop()
  const launches = logs.length
  await new Promise((done) => setTimeout(done, 100))
  expect(logs).toHaveLength(launches)
  expect(
    (await supervisor.getStatus()).every(
      (worker) => !worker.isRunning,
    ),
  ).toBe(true)
})

test("failed executable startup retries without killing CastKit", async () => {
  const supervisor = startManagedWorkers({
    definitions: [
      { deviceId: "unavailable", configPath: "/unused" },
    ],
    command: "/nonexistent/castkit-python",
    restartDelayMs: 20,
    log: () => {},
  })
  onTestFinished(() => supervisor.stop())
  await expect
    .poll(
      async () =>
        (await supervisor.getStatus())[0]?.restarts,
    )
    .toBeGreaterThan(0)
  await supervisor.stop()
})

test("memory telemetry handles a process that has already exited", async () => {
  expect(await readProcessMemory(2147483647)).toEqual({
    rssBytes: 0,
    pssBytes: 0,
  })
})
