import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type {
  CommandHandler,
  MqttPublisher,
} from "@castkit/shared/mqtt/publisher"
import {
  afterEach,
  describe,
  expect,
  test,
  vi,
} from "vitest"
import { loadConfig } from "../config/env.ts"
import { createBrowserMode } from "./browserMode.ts"

/**
 * The backlight LEVEL path through browser mode, with the broker swapped for a
 * recording stub: the two command sources, the loop guard, the restore on the
 * agent's availability, and the management-UI accessors.
 */

const BACKLIT_ID = "dev-backlit"
const EXTERNAL_ID = "dev-external"

const topicsFor = (deviceId: string) => ({
  levelCommand: `castkit/${deviceId}/backlight_level/set`,
  levelState: `castkit/${deviceId}/backlight_level`,
  brightnessCommand: `castkit/${deviceId}/backlight/brightness/set`,
  availability: `castkit/${deviceId}/backlight/available`,
})

const createRecordingPublisher = () => {
  const published: {
    topic: string
    payload: string
    isRetained: boolean
  }[] = []
  const handlers: CommandHandler[] = []

  const publisher: MqttPublisher = {
    isEnabled: true,
    publish: async ({ topic, payload, isRetained }) => {
      published.push({
        topic,
        payload: String(payload),
        isRetained: isRetained ?? false,
      })
    },
    subscribe: async ({ handler }) => {
      handlers.push(handler)
    },
    close: async () => {},
  }

  return { publisher, published, handlers }
}

const startBrowserMode = async () => {
  const configDir = mkdtempSync(
    join(tmpdir(), "castkit-backlight-test-"),
  )
  const devicesFile = join(configDir, "devices.json")
  writeFileSync(
    devicesFile,
    JSON.stringify([
      {
        renderer: "browser",
        id: BACKLIT_ID,
        label: "Dev Backlit",
        mac: "aa:bb:cc:dd:ee:01",
        width: 480,
        height: 320,
        hasMqttBacklight: true,
      },
      {
        renderer: "browser",
        id: EXTERNAL_ID,
        label: "Dev External",
        mac: "aa:bb:cc:dd:ee:02",
        width: 480,
        height: 320,
        hasMqttBacklight: false,
      },
    ]),
  )
  const config = loadConfig({
    INKCAST_DEVICES_FILE: devicesFile,
    MQTT_BASE_TOPIC: "castkit",
  })
  const { publisher, published, handlers } =
    createRecordingPublisher()
  const browserMode = createBrowserMode({
    config,
    publisher,
    getGlobalClockConfig: () => ({
      isTwelveHour: true,
      isNumericDate: false,
    }),
  })
  await browserMode.start()

  const receive = async ({
    topic,
    payload,
  }: {
    topic: string
    payload: string
  }) => {
    await Promise.all(
      handlers.map((handler) =>
        handler({ topic, payload }),
      ),
    )
  }
  const publishedTo = (topic: string) =>
    published.filter((message) => message.topic === topic)

  return { browserMode, published, publishedTo, receive }
}

afterEach(() => {
  vi.useRealTimers()
})

describe("a command on backlight_level/set", () => {
  test("dims the panel at once and retains the level", async () => {
    const { publishedTo, receive } =
      await startBrowserMode()
    const topics = topicsFor(BACKLIT_ID)

    await receive({
      topic: topics.levelCommand,
      payload: "40",
    })

    expect(publishedTo(topics.brightnessCommand)).toEqual([
      {
        topic: topics.brightnessCommand,
        payload: "102",
        isRetained: false,
      },
    ])
    expect(publishedTo(topics.levelState)).toEqual([
      {
        topic: topics.levelState,
        payload: "40",
        isRetained: true,
      },
    ])
  })

  test("ignores a level outside 0–100", async () => {
    const { publishedTo, receive } =
      await startBrowserMode()
    const topics = topicsFor(BACKLIT_ID)

    await receive({
      topic: topics.levelCommand,
      payload: "140",
    })

    expect(publishedTo(topics.brightnessCommand)).toEqual(
      [],
    )
    expect(publishedTo(topics.levelState)).toEqual([])
  })

  test("does nothing for a device whose backlight is not on MQTT", async () => {
    const { publishedTo, receive } =
      await startBrowserMode()
    const topics = topicsFor(EXTERNAL_ID)

    await receive({
      topic: topics.levelCommand,
      payload: "40",
    })

    expect(publishedTo(topics.brightnessCommand)).toEqual(
      [],
    )
    expect(publishedTo(topics.levelState)).toEqual([])
  })
})

describe("a brightness command from the Home Assistant light", () => {
  test("updates the stored level without echoing the brightness", async () => {
    const { browserMode, publishedTo, receive } =
      await startBrowserMode()
    const topics = topicsFor(BACKLIT_ID)

    await receive({
      topic: topics.brightnessCommand,
      payload: "128",
    })

    expect(publishedTo(topics.brightnessCommand)).toEqual(
      [],
    )
    expect(publishedTo(topics.levelState)).toEqual([
      {
        topic: topics.levelState,
        payload: "50",
        isRetained: true,
      },
    ])
    expect(
      browserMode.getDeviceSettings(BACKLIT_ID),
    ).toEqual({ backlightLevel: "50" })
  })
})

describe("the backlight agent's availability", () => {
  test("the first online after start sends the stored level", async () => {
    const { publishedTo, receive } =
      await startBrowserMode()
    const topics = topicsFor(BACKLIT_ID)

    await receive({
      topic: topics.availability,
      payload: "online",
    })

    expect(publishedTo(topics.brightnessCommand)).toEqual([
      {
        topic: topics.brightnessCommand,
        payload: "255",
        isRetained: false,
      },
    ])
  })

  test("a repeated online does not re-send; an offline→online does", async () => {
    const { publishedTo, receive } =
      await startBrowserMode()
    const topics = topicsFor(BACKLIT_ID)

    await receive({
      topic: topics.levelCommand,
      payload: "40",
    })
    await receive({
      topic: topics.availability,
      payload: "online",
    })
    await receive({
      topic: topics.availability,
      payload: "online",
    })
    expect(
      publishedTo(topics.brightnessCommand).map(
        (message) => message.payload,
      ),
    ).toEqual(["102", "102"])

    await receive({
      topic: topics.availability,
      payload: "offline",
    })
    await receive({
      topic: topics.availability,
      payload: "online",
    })
    expect(
      publishedTo(topics.brightnessCommand).map(
        (message) => message.payload,
      ),
    ).toEqual(["102", "102", "102"])
  })

  test("a retained level that lands after the retained online still reaches the panel", async () => {
    const { publishedTo, receive } =
      await startBrowserMode()
    const topics = topicsFor(BACKLIT_ID)

    await receive({
      topic: topics.availability,
      payload: "online",
    })
    await receive({
      topic: topics.levelState,
      payload: "40",
    })

    expect(
      publishedTo(topics.brightnessCommand).map(
        (message) => message.payload,
      ),
    ).toEqual(["255", "102"])
    // A restore is not a fresh command: the retained state is not re-published.
    expect(publishedTo(topics.levelState)).toEqual([])
  })

  test("a retained level that lands while the agent is offline waits for online", async () => {
    const { publishedTo, receive } =
      await startBrowserMode()
    const topics = topicsFor(BACKLIT_ID)

    await receive({
      topic: topics.levelState,
      payload: "40",
    })
    expect(publishedTo(topics.brightnessCommand)).toEqual(
      [],
    )

    await receive({
      topic: topics.availability,
      payload: "online",
    })
    expect(
      publishedTo(topics.brightnessCommand).map(
        (message) => message.payload,
      ),
    ).toEqual(["102"])
  })

  test("a level set this run wins over a late retained restore", async () => {
    const { browserMode, receive } =
      await startBrowserMode()
    const topics = topicsFor(BACKLIT_ID)

    await receive({
      topic: topics.levelCommand,
      payload: "40",
    })
    await receive({
      topic: topics.levelState,
      payload: "80",
    })

    expect(
      browserMode.getDeviceSettings(BACKLIT_ID),
    ).toEqual({ backlightLevel: "40" })
  })
})

describe("the boot-time seed", () => {
  test("retains 100 for a backlit device with no retained level", async () => {
    vi.useFakeTimers()
    const { publishedTo } = await startBrowserMode()

    await vi.advanceTimersByTimeAsync(5_000)

    expect(
      publishedTo(topicsFor(BACKLIT_ID).levelState),
    ).toEqual([
      {
        topic: topicsFor(BACKLIT_ID).levelState,
        payload: "100",
        isRetained: true,
      },
    ])
    expect(
      publishedTo(topicsFor(EXTERNAL_ID).levelState),
    ).toEqual([])
  })
})

describe("the management-UI accessors", () => {
  test("read the level for a backlit device, nothing for an external one, null for a stranger", async () => {
    const { browserMode } = await startBrowserMode()

    expect(
      browserMode.getDeviceSettings(BACKLIT_ID),
    ).toEqual({ backlightLevel: "100" })
    expect(
      browserMode.getDeviceSettings(EXTERNAL_ID),
    ).toEqual({})
    expect(browserMode.getDeviceSettings("nope")).toBeNull()
  })

  test("a write publishes the level command, and refuses any other knob", async () => {
    const { browserMode, publishedTo } =
      await startBrowserMode()
    const topics = topicsFor(BACKLIT_ID)

    expect(
      await browserMode.setDeviceSetting({
        deviceId: BACKLIT_ID,
        kind: "backlightLevel",
        payload: "40",
      }),
    ).toBe(true)
    expect(publishedTo(topics.levelCommand)).toEqual([
      {
        topic: topics.levelCommand,
        payload: "40",
        isRetained: false,
      },
    ])

    expect(
      await browserMode.setDeviceSetting({
        deviceId: BACKLIT_ID,
        kind: "theme",
        payload: "Dark",
      }),
    ).toBe(false)
    expect(
      await browserMode.setDeviceSetting({
        deviceId: EXTERNAL_ID,
        kind: "backlightLevel",
        payload: "40",
      }),
    ).toBe(false)
  })
})
