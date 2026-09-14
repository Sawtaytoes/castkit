import { describe, expect, test } from "vitest"
import type { BrowserDeviceConfig } from "../config/env.ts"
import {
  buildBrowserDeviceTopics,
  buildBrowserDiscoveryMessages,
} from "./browserDiscovery.ts"

const TEST_DEVICE: BrowserDeviceConfig = {
  renderer: "browser",
  id: "dev-square",
  label: "Dev Square",
  mac: "aa:bb:cc:dd:ee:ff",
  width: 720,
  height: 720,
  shape: "square",
  hasTouch: true,
  color: "full",
  hasMqttBacklight: true,
  rotation: 0,
  externalViews: [
    { name: "Disc App", url: "https://example.com/kiosk" },
  ],
}

describe("buildBrowserDeviceTopics", () => {
  test("addresses flat under the base topic", () => {
    const topics = buildBrowserDeviceTopics({
      baseTopic: "castkit",
      deviceId: "dev-square",
    })
    expect(topics.viewCommand).toBe(
      "castkit/dev-square/view/set",
    )
    expect(topics.command).toBe(
      "castkit/dev-square/command",
    )
    expect(topics.queueDataCommand).toBe(
      "castkit/dev-square/queue/set",
    )
    expect(topics.connected).toBe(
      "castkit/dev-square/connected",
    )
    expect(topics.backlightLevelCommand).toBe(
      "castkit/dev-square/backlight_level/set",
    )
    expect(topics.backlightLevelState).toBe(
      "castkit/dev-square/backlight_level",
    )
  })
})

describe("buildBrowserDiscoveryMessages", () => {
  const messages = buildBrowserDiscoveryMessages({
    device: TEST_DEVICE,
    config: { baseTopic: "castkit", nodeId: "castkit" },
  })

  test("creates the browser entity set", () => {
    expect(
      messages.map((message) => message.topic),
    ).toEqual([
      "homeassistant/select/castkit/dev-square_view/config",
      "homeassistant/button/castkit/dev-square_reload/config",
      "homeassistant/sensor/castkit/dev-square_url/config",
      "homeassistant/binary_sensor/castkit/dev-square_connected/config",
      "homeassistant/select/castkit/dev-square_theme/config",
      "homeassistant/light/castkit/dev-square_backlight/config",
      "homeassistant/number/castkit/dev-square_backlight_level/config",
      "homeassistant/select/castkit/dev-square_rotation/config",
      "homeassistant/text/castkit/dev-square_photo_people/config",
      "homeassistant/text/castkit/dev-square_photo_query/config",
      "homeassistant/number/castkit/dev-square_photo_interval/config",
    ])
    expect(
      messages.every((message) => message.isRetained),
    ).toBe(true)
  })

  test("ties every entity to one CastKit device with the capability model string", () => {
    const devices = messages.map(
      (message) => message.payload.device,
    )
    devices.forEach((device) => {
      expect(device).toEqual({
        identifiers: ["castkit_dev-square"],
        connections: [["mac", "aa:bb:cc:dd:ee:ff"]],
        name: "Dev Square",
        manufacturer: "CastKit",
        model: "browser · touch · full · 720×720 square",
      })
    })
  })

  test("availability points at the bridge topic (backlight light: the Pi agent's LWT)", () => {
    messages.forEach((message) => {
      expect(message.payload.availability_topic).toBe(
        message.topic.includes("/light/")
          ? "castkit/dev-square/backlight/available"
          : "castkit/availability",
      )
    })
  })

  test("the backlight level is a config number on CastKit's own topics", () => {
    const backlightLevel = messages.find((message) =>
      message.topic.includes(
        "number/castkit/dev-square_backlight_level/",
      ),
    )
    expect(backlightLevel?.payload).toMatchObject({
      name: "Display: Backlight level",
      unique_id: "castkit_dev-square_backlight_level",
      command_topic:
        "castkit/dev-square/backlight_level/set",
      state_topic: "castkit/dev-square/backlight_level",
      min: 0,
      max: 100,
      step: 1,
      unit_of_measurement: "%",
      icon: "mdi:brightness-6",
      entity_category: "config",
    })
  })

  test("the backlight is a dimmable light on the Pi agent's brightness topics", () => {
    const backlight = messages.find((message) =>
      message.topic.includes(
        "light/castkit/dev-square_backlight/",
      ),
    )!
    expect(backlight.payload.command_topic).toBe(
      "castkit/dev-square/backlight/set",
    )
    expect(backlight.payload.brightness_command_topic).toBe(
      "castkit/dev-square/backlight/brightness/set",
    )
    expect(backlight.payload.brightness_state_topic).toBe(
      "castkit/dev-square/backlight/brightness",
    )
    expect(backlight.payload.brightness_scale).toBe(255)
  })

  test("the View select offers the capability-filtered views", () => {
    const viewSelect = messages[0]!
    expect(viewSelect.payload.options).toEqual([
      "Now Playing",
      "Queue",
      "Ambient",
      "Clock",
      "Weather",
      "Calendar",
      "Photo Frame",
      "Disc App",
    ])
  })

  test("omits the MQTT backlight when the device supplies its own entity", () => {
    const externalBacklightMessages =
      buildBrowserDiscoveryMessages({
        device: {
          ...TEST_DEVICE,
          hasMqttBacklight: false,
        },
      })

    expect(
      externalBacklightMessages.some((message) =>
        message.topic.includes("_backlight"),
      ),
    ).toBe(false)
    expect(
      externalBacklightMessages[0]?.payload.options,
    ).toContain("Disc App")
  })
})
