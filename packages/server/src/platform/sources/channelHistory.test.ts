import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test, vi } from "vitest"
import { createChannelHistory } from "./channelHistory.ts"

const entity = {
  id: "sensor.power",
  name: "Power",
  state: "5",
  domain: "sensor",
  attributes: {},
  actions: [],
}
test("numeric history records changes, survives restart, and prunes the requested window", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "castkit-history-"),
  )
  const file = join(directory, "history.json")
  const clock = { now: Date.parse("2026-01-01T00:00:00Z") }
  const history = createChannelHistory({
    file,
    now: () => clock.now,
  })
  const append = (state: string) =>
    history.append({
      channelId: "chart",
      entities: [{ ...entity, state }],
      hours: 1,
    })
  append("5")
  clock.now += 1000
  const same = append("5")
  expect(same[0]?.attributes.history).toEqual([
    { time: "2026-01-01T00:00:00.000Z", value: 5 },
  ])
  append("6")
  await history.flush()
  const restored = createChannelHistory({
    file,
    now: () => clock.now,
  })
  expect(
    restored.append({
      channelId: "chart",
      entities: [{ ...entity, state: "6" }],
      hours: 1,
    })[0]?.attributes.history,
  ).toHaveLength(2)
  clock.now += 3600001
  expect(append("7")[0]?.attributes.history).toHaveLength(1)
  expect(
    JSON.parse(await readFile(file, "utf8")).version,
  ).toBe(1)
  history.dispose()
  restored.dispose()
  await history.flush()
  await restored.flush()
  await rm(directory, { recursive: true, force: true })
})
test("invalid history files report the error and state histories preserve unavailable gaps", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "castkit-history-"),
  )
  const file = join(directory, "history.json")
  await writeFile(file, "invalid")
  const reportError = vi.fn()
  const history = createChannelHistory({
    file,
    reportError,
  })
  expect(reportError).toHaveBeenCalledTimes(1)
  expect(
    history.append({
      channelId: "chart",
      entities: [{ ...entity, state: "unavailable" }],
      hours: 24,
    })[0]?.attributes,
  ).toMatchObject({
    history: [],
    stateHistory: [
      { state: "unavailable", time: expect.any(String) },
    ],
  })
  history.dispose()
  await history.flush()
  await rm(directory, { recursive: true, force: true })
})

test("a 30-day window survives restart and still removes expired samples", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "castkit-history-month-"),
  )
  const file = join(directory, "history.json")
  const clock = { now: Date.parse("2026-03-01T00:00:00Z") }
  const atDaysAgo = (days: number) =>
    new Date(clock.now - days * 86400000).toISOString()
  const retainedTime = atDaysAgo(29)
  await writeFile(
    file,
    JSON.stringify({
      version: 1,
      channels: [
        {
          id: "chart",
          entities: [
            {
              id: entity.id,
              samples: [
                { time: atDaysAgo(31), value: 1 },
                { time: retainedTime, value: 2 },
              ],
            },
          ],
        },
      ],
    }),
  )
  const history = createChannelHistory({
    file,
    now: () => clock.now,
  })
  expect(
    history.append({
      channelId: "chart",
      entities: [{ ...entity, state: "3" }],
      hours: 720,
    })[0]?.attributes.history,
  ).toEqual([
    { time: retainedTime, value: 2 },
    { time: new Date(clock.now).toISOString(), value: 3 },
  ])
  clock.now += 2 * 86400000
  expect(
    history.append({
      channelId: "chart",
      entities: [{ ...entity, state: "4" }],
      hours: 720,
    })[0]?.attributes.history,
  ).toHaveLength(2)
  history.dispose()
  await history.flush()
  await rm(directory, { recursive: true, force: true })
})
