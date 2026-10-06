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
  isEnabled = true,
  hasRemoteBacklight = true,
  isAssigned = false,
}: {
  isBlocked?: boolean
  isEnabled?: boolean
  hasRemoteBacklight?: boolean
  isAssigned?: boolean
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
        hasRemoteBacklight,
        hasRemoteAmbientLight: true,
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
    isEnabled,
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
        store: createPlatformStore({
          file: join(directory, "platform.json"),
        }),
        getDeviceTarget: isAssigned
          ? () => ({
              kind: "view" as const,
              id: "composition",
            })
          : undefined,
        getTarget: isAssigned
          ? () => ({
              view: {
                id: "composition",
                name: "Composition",
                layout: "single" as const,
                theme: "auto" as const,
                access: "public" as const,
                isControlEnabled: false,
                panels: [
                  {
                    id: "panel",
                    specId: "now-playing",
                    bindings: {
                      data: "room/music",
                      weather: "room/weather",
                      agenda: "room/agenda",
                    },
                    settings: {},
                  },
                ],
              },
            })
          : undefined,
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
  const controls = async () =>
    await (
      await app.request("/d/panel/controls.json")
    ).json()
  const effective = async () =>
    (
      await (
        await app.request("/d/panel/controls.json")
      ).json()
    ).backlight_percent
  return {
    mode,
    app,
    controls,
    messages,
    subscriptions,
    receive,
    effective,
    channelHub,
    create,
    publisher,
  }
}

test("ambient settings apply with no broker, coexist with backlight, and survive disk restart", async () => {
  const fixture = await createFixture({ isEnabled: false })
  expect((await fixture.controls()).ambientLight).toEqual({
    isOn: false,
    brightness: 5,
    mode: "album-glow",
    demo: false,
  })
  await fixture.mode.setDeviceSetting({
    deviceId: "panel",
    kind: "ambientLightBrightness",
    payload: "23",
  })
  await fixture.mode.setDeviceSetting({
    deviceId: "panel",
    kind: "ambientLightMode",
    payload: "meeting-fuse",
  })
  await fixture.mode.setDeviceSetting({
    deviceId: "panel",
    kind: "ambientLightDemo",
    payload: "true",
  })
  expect((await fixture.controls()).ambientLight).toEqual({
    isOn: false,
    brightness: 23,
    mode: "meeting-fuse",
    demo: true,
  })
  expect((await fixture.controls()).backlight_percent).toBe(
    0,
  )
  const restored = fixture.create()
  expect(
    restored.mode.getDeviceSettings("panel"),
  ).toMatchObject({
    ambientLightBrightness: "23",
    ambientLightMode: "meeting-fuse",
    ambientLightDemo: "true",
    backlightLevel: "35",
    backlightPower: "off",
  })
  expect(
    await fixture.mode.setDeviceSetting({
      deviceId: "panel",
      kind: "ambientLightBrightness",
      payload: "101",
    }),
  ).toBe(false)
  expect(
    await fixture.mode.setDeviceSetting({
      deviceId: "panel",
      kind: "ambientLightMode",
      payload: "unknown",
    }),
  ).toBe(false)
})
test("startup publishes standard light state, commands mirror the device and CastKit without echo or retained restore", async () => {
  const fixture = await createFixture()
  const light = fixture.messages.find((message) =>
    message.topic.endsWith("panel_ambient_light/config"),
  )
  expect(
    JSON.parse(light?.payload ?? "null"),
  ).toMatchObject({
    schema: "json",
    flash: false,
    brightness_scale: 100,
    effect_list: [
      "album-glow",
      "swipe-comet",
      "meeting-fuse",
      "weather-aura",
      "progress-bar",
    ],
    availability_topic: "castkit/availability",
  })
  expect(fixture.subscriptions).toContain(
    "castkit/panel/ambient_light/set",
  )
  expect(fixture.subscriptions).not.toContain(
    "castkit/panel/ambient_light/state",
  )
  expect(fixture.messages).toContainEqual({
    topic: "castkit/panel/ambient_light/state",
    payload: JSON.stringify({
      state: "OFF",
      brightness: 5,
      effect: "album-glow",
      demo: false,
    }),
    isRetained: true,
  })
  await fixture.receive(
    "ambient_light/set",
    JSON.stringify({
      brightness: 18,
      effect: "weather-aura",
    }),
  )
  expect((await fixture.controls()).ambientLight).toEqual({
    isOn: true,
    brightness: 18,
    mode: "weather-aura",
    demo: false,
  })
  expect(
    fixture.mode.getDeviceSettings("panel"),
  ).toMatchObject({
    ambientLightPower: "on",
    ambientLightBrightness: "18",
    ambientLightMode: "weather-aura",
  })
  await fixture.receive(
    "ambient_light/set",
    JSON.stringify({ state: "OFF" }),
  )
  await fixture.receive(
    "ambient_light/set",
    JSON.stringify({ state: "ON" }),
  )
  expect(
    (await fixture.controls()).ambientLight.brightness,
  ).toBe(18)
  await fixture.receive(
    "ambient_light/set",
    JSON.stringify({ brightness: 0 }),
  )
  expect(
    (await fixture.controls()).ambientLight,
  ).toMatchObject({ isOn: false, brightness: 18 })
  await fixture.receive(
    "ambient_light/set",
    JSON.stringify({ state: "OFF", brightness: 22 }),
  )
  expect(
    (await fixture.controls()).ambientLight,
  ).toMatchObject({ isOn: false, brightness: 22 })
  await fixture.mode.setDeviceSetting({
    deviceId: "panel",
    kind: "ambientLightPower",
    payload: "on",
  })
  expect(fixture.messages.at(-1)).toEqual({
    topic: "castkit/panel/ambient_light/state",
    payload: JSON.stringify({
      state: "ON",
      brightness: 22,
      effect: "weather-aura",
      demo: false,
    }),
    isRetained: true,
  })
  expect(
    fixture.messages.filter(
      (message) =>
        message.topic === "castkit/panel/ambient_light/set",
    ),
  ).toEqual([])
  const restored = fixture.create()
  await restored.mode.start()
  expect(
    fixture.messages
      .filter(
        (message) =>
          message.topic ===
          "castkit/panel/ambient_light/state",
      )
      .at(-1),
  ).toEqual({
    topic: "castkit/panel/ambient_light/state",
    payload: JSON.stringify({
      state: "ON",
      brightness: 22,
      effect: "weather-aura",
      demo: false,
    }),
    isRetained: true,
  })
  expect(
    (
      await (
        await restored.app.request("/d/panel/controls.json")
      ).json()
    ).ambientLight,
  ).toMatchObject({ isOn: true, brightness: 22 })
  await fixture.receive("ambient_light/set", "not json")
  await fixture.receive(
    "ambient_light/set",
    JSON.stringify({ effect: "invalid", brightness: 80 }),
  )
  expect(
    (await fixture.controls()).ambientLight.brightness,
  ).toBe(22)
})
test("a broker outage cannot block native ambient updates or enqueue duplicate state", async () => {
  const fixture = await createFixture({ isBlocked: true })
  await fixture.mode.setDeviceSetting({
    deviceId: "panel",
    kind: "ambientLightPower",
    payload: "on",
  })
  await fixture.mode.setDeviceSetting({
    deviceId: "panel",
    kind: "ambientLightPower",
    payload: "on",
  })
  expect((await fixture.controls()).ambientLight.isOn).toBe(
    true,
  )
  expect(fixture.publisher.publish).toHaveBeenCalledTimes(1)
})

test("ambient-only hardware exposes its controls manifest without inventing a backlight", async () => {
  const fixture = await createFixture({
    isEnabled: false,
    hasRemoteBacklight: false,
  })
  expect(
    (
      await (
        await fixture.app.request("/d/panel/castkit.json")
      ).json()
    ).controls_url,
  ).toBe("/d/panel/controls.json")
  expect(await fixture.controls()).toEqual({
    ambientLight: {
      isOn: false,
      brightness: 5,
      mode: "album-glow",
      demo: false,
    },
    ambientLightData: {
      progress: 0,
      isPlaying: false,
      durationSeconds: null,
      secondsUntilEvent: null,
      weather: "",
    },
  })
})

test("effect metadata reads only the assigned composition's ready bound feeds", async () => {
  const fixture = await createFixture({ isAssigned: true })
  fixture.channelHub.configure([
    {
      id: "room/music",
      name: "Music",
      type: "now-playing.v1",
      sourceId: "source",
      settings: {},
    },
    {
      id: "room/weather",
      name: "Weather",
      type: "weather.v1",
      sourceId: "source",
      settings: {},
    },
    {
      id: "room/agenda",
      name: "Agenda",
      type: "agenda.v1",
      sourceId: "source",
      settings: {},
    },
  ])
  await fixture.receive(
    "now_playing/set",
    JSON.stringify({
      artist: "Unrelated",
      title: "Unrelated",
      isPlaying: true,
      durationSeconds: 20,
      positionSeconds: 15,
    }),
  )
  expect(
    (await fixture.controls()).ambientLightData
      .durationSeconds,
  ).toBe(null)
  fixture.channelHub.publish({
    channelId: "room/music",
    data: {
      artist: "Artist",
      title: "Track",
      isPlaying: false,
      durationSeconds: 100,
      positionSeconds: 25,
    },
  })
  fixture.channelHub.publish({
    channelId: "room/weather",
    data: {
      temperatureText: "20°",
      conditionText: "Cloudy",
      condition: "cloudy",
    },
  })
  fixture.channelHub.publish({
    channelId: "room/agenda",
    data: {
      events: [
        {
          startMs: Date.now() + 60000,
          summary: "Meeting",
          isAllDay: false,
        },
      ],
    },
  })
  const controls = await fixture.controls()
  expect(controls.ambientLightData).toMatchObject({
    progress: 0.25,
    isPlaying: false,
    durationSeconds: 100,
    weather: "cloudy",
  })
  expect(
    controls.ambientLightData.secondsUntilEvent,
  ).toBeGreaterThan(59)
  expect(
    controls.ambientLightData.secondsUntilEvent,
  ).toBeLessThanOrEqual(60)
})
