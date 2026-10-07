import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { CommandHandler } from "@castkit/shared/mqtt/publisher"
import { Hono } from "hono"
import { afterEach, expect, test, vi } from "vitest"
import { loadConfig } from "../config/env.ts"
import { createChannelHub } from "../platform/channelHub.ts"
import { createPlatformStore } from "../platform/platformStore.ts"
import { createBrowserMode } from "./browserMode.ts"

const cleanup = new Set<() => void>()
afterEach(() => {
  cleanup.forEach((dispose) => {
    dispose()
  })
  cleanup.clear()
})

const createFixture = async ({
  isBlocked = false,
}: {
  isBlocked?: boolean
} = {}) => {
  const directory = mkdtempSync(
    join(tmpdir(), "castkit-native-mqtt-"),
  )
  cleanup.add(() => {
    rmSync(directory, { recursive: true, force: true })
  })
  const devicesFile = join(directory, "devices.json")
  writeFileSync(
    devicesFile,
    JSON.stringify([
      {
        renderer: "browser",
        id: "panel",
        label: "Test panel",
        mac: "02:00:00:00:00:01",
        width: 480,
        height: 480,
        hasRemoteBacklight: true,
        hasMqttBacklight: false,
      },
    ]),
  )
  const config = loadConfig({
    INKCAST_DEVICES_FILE: devicesFile,
    MQTT_BASE_TOPIC: "castkit",
  })
  const store = createPlatformStore({
    file: join(directory, "platform.json"),
  })
  store.update((state) => ({
    ...state,
    deviceBacklights: {
      panel: {
        level: 35,
        power: "off",
        channel: "",
        entity: "",
      },
    },
  }))
  const channelHub = createChannelHub()
  cleanup.add(channelHub.dispose)
  const messages: {
    topic: string
    payload: string
    isRetained: boolean
  }[] = []
  const handlers: CommandHandler[] = []
  const subscriptions: string[] = []
  const publisher = {
    isEnabled: true,
    publish: vi.fn(
      async ({
        topic,
        payload,
        isRetained,
      }: {
        topic: string
        payload: string | Uint8Array
        isRetained?: boolean
      }) => {
        if (isBlocked) return new Promise<void>(() => {})
        messages.push({
          topic,
          payload: String(payload),
          isRetained: isRetained ?? false,
        })
      },
    ),
    subscribe: async ({
      topics,
      handler,
    }: {
      topics: string[]
      handler: CommandHandler
    }) => {
      subscriptions.push(...topics)
      handlers.push(handler)
    },
    close: async () => {},
  }
  const create = () => {
    const mode = createBrowserMode({
      config,
      publisher,
      platform: {
        store,
        hub: channelHub,
        runtime: { executeAction: async () => null },
      },
      getGlobalClockConfig: () => ({
        isTwelveHour: false,
        isNumericDate: false,
      }),
    })
    cleanup.add(mode.stop)
    const app = new Hono()
    mode.attach(app)
    return { mode, app }
  }
  const { mode, app } = create()
  if (!isBlocked) await mode.start()
  const receive = async (
    suffix: string,
    payload: string,
  ) => {
    await Promise.all(
      handlers.map((handler) =>
        handler({
          topic: `castkit/panel/${suffix}`,
          payload,
        }),
      ),
    )
  }
  const effective = async () =>
    (
      await (
        await app.request("/d/panel/controls.json")
      ).json()
    ).backlight_percent
  return {
    mode,
    messages,
    subscriptions,
    receive,
    effective,
    channelHub,
    create,
    publisher,
  }
}

test("startup publishes persisted native state and never restores an older retained MQTT value", async () => {
  const fixture = await createFixture()
  expect(
    fixture.messages.filter((message) =>
      message.topic.startsWith("castkit/panel/backlight"),
    ),
  ).toEqual([
    {
      topic: "castkit/panel/backlight",
      payload: "OFF",
      isRetained: true,
    },
    {
      topic: "castkit/panel/backlight/brightness",
      payload: "89",
      isRetained: true,
    },
    {
      topic: "castkit/panel/backlight_level",
      payload: "35",
      isRetained: true,
    },
  ])
  expect(fixture.subscriptions).not.toContain(
    "castkit/panel/backlight_level",
  )
  expect(fixture.subscriptions).not.toContain(
    "castkit/panel/backlight/available",
  )
  await fixture.receive("backlight_level", "100")
  expect(
    fixture.mode.getDeviceSettings("panel"),
  ).toMatchObject({
    backlightLevel: "35",
    backlightPower: "off",
  })
  expect(await fixture.effective()).toBe(0)
})

test("CastKit changes mirror MQTT and the device while off/on keeps the chosen level", async () => {
  const fixture = await createFixture()
  await fixture.mode.setDeviceSetting({
    deviceId: "panel",
    kind: "backlightLevel",
    payload: "42",
  })
  expect(await fixture.effective()).toBe(0)
  await fixture.mode.setDeviceSetting({
    deviceId: "panel",
    kind: "backlightPower",
    payload: "on",
  })
  expect(await fixture.effective()).toBe(42)
  expect(fixture.messages).toContainEqual({
    topic: "castkit/panel/backlight",
    payload: "ON",
    isRetained: true,
  })
  expect(fixture.messages).toContainEqual({
    topic: "castkit/panel/backlight/brightness",
    payload: "107",
    isRetained: true,
  })
  await fixture.mode.setDeviceSetting({
    deviceId: "panel",
    kind: "backlightPower",
    payload: "off",
  })
  expect(await fixture.effective()).toBe(0)
  const restored = fixture.create()
  expect(
    restored.mode.getDeviceSettings("panel"),
  ).toMatchObject({
    backlightLevel: "42",
    backlightPower: "off",
  })
})

test("Home Assistant MQTT commands change the same persisted controls without command echoes", async () => {
  const fixture = await createFixture()
  await fixture.receive("backlight/brightness/set", "1")
  expect(await fixture.effective()).toBe(1)
  await fixture.receive("backlight/brightness/set", "128")
  expect(
    fixture.mode.getDeviceSettings("panel"),
  ).toMatchObject({
    backlightLevel: "50",
    backlightPower: "on",
  })
  expect(await fixture.effective()).toBe(50)
  await fixture.receive("backlight/set", "OFF")
  expect(await fixture.effective()).toBe(0)
  await fixture.receive("backlight/set", "ON")
  expect(await fixture.effective()).toBe(50)
  await fixture.receive("backlight/brightness/set", "0")
  expect(
    fixture.mode.getDeviceSettings("panel"),
  ).toMatchObject({
    backlightLevel: "50",
    backlightPower: "off",
  })
  await fixture.receive("backlight/set", "ON")
  expect(await fixture.effective()).toBe(50)
  await fixture.receive("backlight_level/set", "22")
  expect(await fixture.effective()).toBe(22)
  expect(
    fixture.messages.filter(
      (message) =>
        message.topic.includes("backlight") &&
        message.topic.endsWith("/set"),
    ),
  ).toEqual([])
  await fixture.receive("backlight/brightness/set", "256")
  await fixture.receive("backlight/set", "INVALID")
  expect(await fixture.effective()).toBe(22)
})

test("optional room following mirrors source changes and an HA command overrides that policy", async () => {
  const fixture = await createFixture()
  fixture.channelHub.configure([
    {
      id: "room/lights",
      name: "Room lights",
      type: "entities.v1",
      sourceId: "source",
      settings: {},
    },
  ])
  await fixture.mode.setDeviceSetting({
    deviceId: "panel",
    kind: "backlightRoomChannel",
    payload: "room/lights",
  })
  await fixture.mode.setDeviceSetting({
    deviceId: "panel",
    kind: "backlightRoomEntity",
    payload: "light.room",
  })
  await fixture.mode.setDeviceSetting({
    deviceId: "panel",
    kind: "backlightPower",
    payload: "follow-room",
  })
  const publishRoom = (state: string) =>
    fixture.channelHub.publish({
      channelId: "room/lights",
      data: {
        entities: [
          {
            id: "light.room",
            name: "Room light",
            domain: "light",
            state,
            attributes: {},
            actions: [],
          },
        ],
      },
    })
  publishRoom("on")
  expect(await fixture.effective()).toBe(35)
  expect(fixture.messages.at(-3)).toEqual({
    topic: "castkit/panel/backlight",
    payload: "ON",
    isRetained: true,
  })
  publishRoom("off")
  expect(await fixture.effective()).toBe(0)
  expect(fixture.messages.at(-3)).toEqual({
    topic: "castkit/panel/backlight",
    payload: "OFF",
    isRetained: true,
  })
  await fixture.receive("backlight/set", "ON")
  publishRoom("off")
  expect(await fixture.effective()).toBe(35)
  expect(
    fixture.mode.getDeviceSettings("panel"),
  ).toMatchObject({ backlightPower: "on" })
})

test("a broker that never acknowledges publishes cannot delay native control", async () => {
  const fixture = await createFixture({ isBlocked: true })
  await fixture.mode.setDeviceSetting({
    deviceId: "panel",
    kind: "backlightPower",
    payload: "on",
  })
  expect(await fixture.effective()).toBe(35)
  expect(fixture.publisher.publish).toHaveBeenCalled()
})
