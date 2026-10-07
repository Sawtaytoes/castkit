import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DEFAULT_AMBIENT_LIGHT_VIEW_MODES } from "@castkit/sdk/ambientLight"
import type { ViewDefinition } from "@castkit/sdk/contracts"
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
  hasRemoteAmbientLight = true,
  isAssigned = false,
}: {
  isBlocked?: boolean
  isEnabled?: boolean
  hasRemoteBacklight?: boolean
  hasRemoteAmbientLight?: boolean
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
        hasTouch: true,
        hasRemoteBacklight,
        hasRemoteAmbientLight,
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
  const targetState: {
    target:
      | { kind: "view" | "screen"; id: string }
      | undefined
    view: ViewDefinition | undefined
  } = {
    target: isAssigned
      ? { kind: "view", id: "composition" }
      : undefined,
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
  }
  const listeners = new Set<() => void>()
  const notify = () =>
    listeners.forEach((listener) => {
      listener()
    })
  const create = () => {
    const mode = createBrowserMode({
      config,
      publisher,
      platform: {
        store: createPlatformStore({
          file: join(directory, "platform.json"),
        }),
        getDeviceTarget: () => targetState.target,
        getTarget: () =>
          targetState.view
            ? { view: targetState.view }
            : null,
        subscribe: (listener) => {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
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
    targetState,
    notify,
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
      "follow-view",
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
      resolved_effect: "album-glow",
      followView: false,
      viewModes: DEFAULT_AMBIENT_LIGHT_VIEW_MODES,
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
    JSON.stringify({ state: "ON", brightness: 0 }),
  )
  expect(
    (await fixture.controls()).ambientLight,
  ).toMatchObject({ isOn: false, brightness: 18 })
  await fixture.receive(
    "ambient_light/set",
    JSON.stringify({ state: "ON" }),
  )
  expect(
    (await fixture.controls()).ambientLight,
  ).toMatchObject({ isOn: true, brightness: 18 })
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
      resolved_effect: "weather-aura",
      followView: false,
      viewModes: DEFAULT_AMBIENT_LIGHT_VIEW_MODES,
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
      resolved_effect: "weather-aura",
      followView: false,
      viewModes: DEFAULT_AMBIENT_LIGHT_VIEW_MODES,
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
    ambientLightPolicy: {
      isOn: false,
      brightness: 5,
      mode: "album-glow",
      demo: false,
      followView: false,
      viewModes: DEFAULT_AMBIENT_LIGHT_VIEW_MODES,
    },
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

const configureAmbient = async ({
  mode,
  settings,
}: {
  mode: ReturnType<typeof createBrowserMode>
  settings: Record<string, string>
}) =>
  Object.entries(settings).reduce(
    async (previous, [kind, payload]) => {
      await previous
      expect(
        await mode.setDeviceSetting({
          deviceId: "panel",
          kind,
          payload,
        }),
      ).toBe(true)
    },
    Promise.resolve(),
  )

const lastAmbientState = (
  fixture: Awaited<ReturnType<typeof createFixture>>,
) =>
  JSON.parse(
    fixture.messages
      .filter(
        (message) =>
          message.topic ===
          "castkit/panel/ambient_light/state",
      )
      .at(-1)?.payload ?? "null",
  )

test("following builtin views resolves physical effects, mirrors MQTT, and never overrides manual off or remembered brightness", async () => {
  const fixture = await createFixture()
  await configureAmbient({
    mode: fixture.mode,
    settings: {
      ambientLightPower: "on",
      ambientLightBrightness: "50",
      ambientLightMode: "weather-aura",
      ambientLightFollowView: "true",
    },
  })
  expect((await fixture.controls()).ambientLight).toEqual({
    isOn: true,
    brightness: 50,
    mode: "album-glow",
    demo: false,
  })
  await (
    [
      ["Calendar", "meeting-fuse"],
      ["Queue", "progress-bar"],
      ["Touch Test", "swipe-comet"],
      ["Ambient", "weather-aura"],
      ["Clock", "weather-aura"],
      ["Weather", "weather-aura"],
    ] as const
  ).reduce(async (previous, [view, effect]) => {
    await previous
    await fixture.receive("view/set", view)
    expect(
      (await fixture.controls()).ambientLight,
    ).toMatchObject({
      isOn: true,
      mode: effect,
      brightness: 50,
    })
    expect(lastAmbientState(fixture)).toMatchObject({
      state: "ON",
      effect: "follow-view",
      resolved_effect: effect,
      brightness: 50,
    })
  }, Promise.resolve())
  await fixture.receive("view/set", "Photo Frame")
  expect(
    (await fixture.controls()).ambientLight,
  ).toMatchObject({ isOn: false, brightness: 50 })
  expect(
    fixture.mode.getDeviceSettings("panel"),
  ).toMatchObject({
    ambientLightPower: "on",
    ambientLightEffectivePower: "off",
    ambientLightEffectiveMode: "off",
    ambientLightEffectiveViewId: "builtin:photo-frame",
  })
  expect(lastAmbientState(fixture)).toMatchObject({
    state: "OFF",
    effect: "follow-view",
    resolved_effect: "off",
  })
  await configureAmbient({
    mode: fixture.mode,
    settings: { ambientLightPower: "off" },
  })
  await fixture.receive("view/set", "Now Playing")
  expect(
    (await fixture.controls()).ambientLight,
  ).toMatchObject({
    isOn: false,
    mode: "album-glow",
    brightness: 50,
  })
  expect(
    fixture.mode.getDeviceSettings("panel"),
  ).toMatchObject({
    ambientLightPower: "off",
    ambientLightFollowView: "true",
    ambientLightBrightness: "50",
    ambientLightMode: "weather-aura",
  })
  await configureAmbient({
    mode: fixture.mode,
    settings: {
      ambientLightFollowView: "false",
      ambientLightPower: "on",
    },
  })
  expect(
    (await fixture.controls()).ambientLight,
  ).toMatchObject({
    isOn: true,
    mode: "weather-aura",
    brightness: 50,
  })
})

test("view policy persists without a broker, keeps namespaces separate, and rejects invalid rules", async () => {
  const fixture = await createFixture({ isEnabled: false })
  await configureAmbient({
    mode: fixture.mode,
    settings: {
      ambientLightPower: "on",
      ambientLightBrightness: "50",
      ambientLightDemo: "true",
      ambientLightFollowView: "true",
      ambientLightViewModes: JSON.stringify({
        "builtin:now-playing": "progress-bar",
        "view:now-playing": "off",
      }),
    },
  })
  expect((await fixture.controls()).ambientLight).toEqual({
    isOn: true,
    brightness: 50,
    mode: "progress-bar",
    demo: true,
  })
  expect(
    await fixture.mode.setDeviceSetting({
      deviceId: "panel",
      kind: "ambientLightViewModes",
      payload: JSON.stringify({
        "now-playing": "album-glow",
      }),
    }),
  ).toBe(false)
  expect(
    await fixture.mode.setDeviceSetting({
      deviceId: "panel",
      kind: "ambientLightViewModes",
      payload: JSON.stringify({
        "builtin:now-playing": "unknown",
      }),
    }),
  ).toBe(false)
  const restored = fixture.create()
  const controls = await (
    await restored.app.request("/d/panel/controls.json")
  ).json()
  expect(controls.ambientLight).toEqual({
    isOn: true,
    brightness: 50,
    mode: "progress-bar",
    demo: true,
  })
  expect(controls.ambientLightPolicy).toMatchObject({
    followView: true,
    mode: "album-glow",
    viewModes: {
      "builtin:now-playing": "progress-bar",
      "view:now-playing": "off",
    },
  })
})

test("MQTT automatic and manual effects share native policy and retained startup state", async () => {
  const fixture = await createFixture()
  await fixture.receive(
    "ambient_light/set",
    JSON.stringify({
      state: "ON",
      brightness: 50,
      effect: "follow-view",
      viewModes: { "builtin:now-playing": "swipe-comet" },
    }),
  )
  expect(
    fixture.mode.getDeviceSettings("panel"),
  ).toMatchObject({
    ambientLightFollowView: "true",
    ambientLightBrightness: "50",
    ambientLightEffectiveMode: "swipe-comet",
  })
  expect(
    (await fixture.controls()).ambientLight,
  ).toMatchObject({ isOn: true, mode: "swipe-comet" })
  const restored = fixture.create()
  await restored.mode.start()
  expect(lastAmbientState(fixture)).toMatchObject({
    state: "ON",
    effect: "follow-view",
    resolved_effect: "swipe-comet",
    followView: true,
    viewModes: { "builtin:now-playing": "swipe-comet" },
  })
  await fixture.receive(
    "ambient_light/set",
    JSON.stringify({ effect: "meeting-fuse" }),
  )
  expect(
    fixture.mode.getDeviceSettings("panel"),
  ).toMatchObject({
    ambientLightFollowView: "false",
    ambientLightMode: "meeting-fuse",
    ambientLightBrightness: "50",
  })
  expect(
    (await fixture.controls()).ambientLight,
  ).toMatchObject({ isOn: true, mode: "meeting-fuse" })
  await configureAmbient({
    mode: fixture.mode,
    settings: {
      ambientLightFollowView: "true",
      ambientLightMode: "weather-aura",
    },
  })
  expect(
    fixture.mode.getDeviceSettings("panel"),
  ).toMatchObject({
    ambientLightFollowView: "false",
    ambientLightMode: "weather-aura",
  })
})

test("screen view changes and temporary overrides resolve actual platform IDs and publish only changed state", async () => {
  const fixture = await createFixture({ isAssigned: true })
  await configureAmbient({
    mode: fixture.mode,
    settings: {
      ambientLightPower: "on",
      ambientLightBrightness: "50",
      ambientLightFollowView: "true",
    },
  })
  expect((await fixture.controls()).ambientLight.isOn).toBe(
    false,
  )
  await configureAmbient({
    mode: fixture.mode,
    settings: {
      ambientLightViewModes: JSON.stringify({
        "view:composition": "meeting-fuse",
        "view:queue": "off",
        "view:temporary": "progress-bar",
      }),
    },
  })
  expect(
    (await fixture.controls()).ambientLight,
  ).toMatchObject({
    isOn: true,
    mode: "meeting-fuse",
    brightness: 50,
  })
  const platformView = fixture.targetState.view
  if (!platformView)
    throw new Error("Missing platform fixture view")
  fixture.targetState.target = {
    kind: "screen",
    id: "screen-container",
  }
  fixture.targetState.view = {
    ...platformView,
    id: "queue",
    name: "A renamed custom view",
  }
  fixture.notify()
  expect(
    fixture.mode.getDeviceSettings("panel"),
  ).toMatchObject({
    ambientLightEffectiveViewId: "view:queue",
    ambientLightEffectiveView: "A renamed custom view",
    ambientLightEffectiveMode: "off",
    ambientLightPower: "on",
  })
  expect(lastAmbientState(fixture)).toMatchObject({
    state: "OFF",
    resolved_effect: "off",
  })
  fixture.targetState.target = {
    kind: "view",
    id: "temporary",
  }
  fixture.targetState.view = {
    ...fixture.targetState.view,
    id: "temporary",
  }
  fixture.notify()
  expect(
    (await fixture.controls()).ambientLight,
  ).toMatchObject({
    isOn: true,
    mode: "progress-bar",
    brightness: 50,
  })
  fixture.targetState.target = {
    kind: "screen",
    id: "screen-container",
  }
  fixture.targetState.view = {
    ...fixture.targetState.view,
    id: "composition",
  }
  fixture.notify()
  expect(lastAmbientState(fixture)).toMatchObject({
    state: "ON",
    resolved_effect: "meeting-fuse",
  })
  const count = fixture.publisher.publish.mock.calls.length
  fixture.notify()
  expect(fixture.publisher.publish.mock.calls).toHaveLength(
    count,
  )
  fixture.targetState.view = undefined
  fixture.notify()
  expect((await fixture.controls()).ambientLight.isOn).toBe(
    false,
  )
  expect(
    fixture.mode.getDeviceSettings("panel"),
  ).toMatchObject({
    ambientLightEffectiveViewId: "",
    ambientLightEffectiveMode: "off",
  })
})

test("unsupported devices offer no ambient policy settings, wire controls or MQTT discovery", async () => {
  const fixture = await createFixture({
    hasRemoteAmbientLight: false,
  })
  expect(
    fixture.mode.getDeviceSettings("panel"),
  ).not.toHaveProperty("ambientLightFollowView")
  expect(
    (await fixture.controls()).ambientLight,
  ).toBeUndefined()
  expect(
    fixture.messages.some((message) =>
      message.topic.endsWith("panel_ambient_light/config"),
    ),
  ).toBe(false)
  expect(
    await fixture.mode.setDeviceSetting({
      deviceId: "panel",
      kind: "ambientLightFollowView",
      payload: "true",
    }),
  ).toBe(false)
})
