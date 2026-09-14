import {
  IMPRESSION_DEVICE,
  PHAT_DEVICE,
} from "@castkit/core/devices/device"
import { describe, expect, test } from "vitest"
import {
  buildAvailabilityTopic,
  buildDeviceTopics,
  buildDiscoveryMessages,
  buildGlobalDiscoveryMessages,
} from "./discovery.ts"

describe("buildDeviceTopics", () => {
  test("derives all runtime topics from the base + device id", () => {
    const topics = buildDeviceTopics({
      device: PHAT_DEVICE,
    })

    expect(topics.image).toBe("inkcast/inky-phat/image")
    expect(topics.viewCommand).toBe(
      "inkcast/inky-phat/view/set",
    )
    expect(topics.lastRender).toBe(
      "inkcast/inky-phat/last_render",
    )
  })

  test("honors a custom base topic", () => {
    const topics = buildDeviceTopics({
      baseTopic: "displays",
      device: PHAT_DEVICE,
    })

    expect(topics.image).toBe("displays/inky-phat/image")
  })
})

describe("buildAvailabilityTopic", () => {
  test("is one bridge-level topic, not per device", () => {
    expect(buildAvailabilityTopic()).toBe(
      "inkcast/availability",
    )
    expect(buildAvailabilityTopic("displays")).toBe(
      "displays/availability",
    )
  })
})

describe("buildDiscoveryMessages", () => {
  const messages = buildDiscoveryMessages({
    device: PHAT_DEVICE,
    viewNames: ["Now Playing (Dashboard)", "Clock"],
  })

  test("emits the full entity set for a mono panel (no color-mode select)", () => {
    const components = messages.map(
      (message) => message.topic.split("/")[1],
    )
    expect(components).toEqual([
      "image",
      "select", // view
      "button", // refresh
      "switch", // updates (master pause)
      "select", // Display: Dither
      "select", // Display: Rotation
      "number", // Display: Brightness
      "number", // Display: Saturation
      "number", // Display: Margin top
      "number", // Display: Margin right
      "number", // Display: Margin bottom
      "number", // Display: Margin left
      "text", // Photo Frame: People
      "text", // Photo Frame: Query
      "text", // Clock: Timezone
      "select", // Clock: Time format
      "select", // Clock: Date style
      "number", // Photo Frame: Rotation minutes
      "number", // Photo Frame: Recency half-life days
      "number", // Photo Frame: People minimum
      "select", // Photo Frame: Format
      "number", // Photo Frame: Quality
      "number", // Photo Frame: Crop top
      "number", // Photo Frame: Crop right
      "number", // Photo Frame: Crop bottom
      "number", // Photo Frame: Crop left
      "button", // Photo Frame: Next photo
      "button", // Photo Frame: Previous photo
      "sensor", // last render
    ])
  })

  test("the global device exposes the clock + inherited photo-frame defaults", () => {
    // HA pushes now-playing/weather/agenda data, so the server no longer
    // advertises a Music-playing sensor or Weather/Agenda entity-picker config.
    const globalMessages = buildGlobalDiscoveryMessages()
    expect(
      globalMessages.map((message) => message.topic),
    ).toEqual([
      "homeassistant/text/inkcast/server_clock_timezone/config",
      "homeassistant/select/inkcast/server_clock_time_format/config",
      "homeassistant/select/inkcast/server_clock_date_style/config",
      "homeassistant/number/inkcast/server_photo_interval/config",
      "homeassistant/number/inkcast/server_photo_recency/config",
      "homeassistant/number/inkcast/server_photo_people_minimum/config",
      "homeassistant/select/inkcast/server_photo_format/config",
      "homeassistant/number/inkcast/server_photo_quality/config",
    ])
    expect(
      (
        globalMessages[0].payload.device as {
          name: string
        }
      ).name,
    ).toBe("CastKit Server")
  })

  // ⚠️ The topic and unique_id keep the BRITISH spelling deliberately. Home
  // Assistant keys its entity off them, so renaming orphans
  // `select.<device>_colour_mode` and every card and automation naming it.
  // These assertions exist to make that contract fail loudly if anybody
  // "finishes" the American-spelling rename without an HA-side migration.
  test("adds the color-mode select on a color panel only", () => {
    const colorMessages = buildDiscoveryMessages({
      device: IMPRESSION_DEVICE,
      viewNames: ["Clock"],
    })

    const colorModeMessage = colorMessages.find((message) =>
      message.topic.includes("_colour_mode/"),
    )
    expect(colorModeMessage?.payload.options).toEqual([
      "Color",
      "Black & White",
    ])
    expect(
      messages.some((message) =>
        message.topic.includes("_colour_mode/"),
      ),
    ).toBe(false)
  })

  test("the per-device photo-format select offers Auto + the three formats", () => {
    const formatMessage = messages.find((message) =>
      message.topic.includes("_photo_format/"),
    )
    expect(formatMessage?.payload.options).toEqual([
      "Auto",
      "JPEG",
      "WebP",
      "PNG",
    ])
    // The global default select has no "Auto" — it is the root default.
    const globalFormatMessage =
      buildGlobalDiscoveryMessages().find((message) =>
        message.topic.includes("server_photo_format/"),
      )
    expect(globalFormatMessage?.payload.options).toEqual([
      "JPEG",
      "WebP",
      "PNG",
    ])
  })

  test("the per-device rotation select offers 0/90/180/270", () => {
    const rotationMessage = messages.find((message) =>
      message.topic.includes("_rotation/"),
    )
    expect(rotationMessage?.payload.options).toEqual([
      "0",
      "90",
      "180",
      "270",
    ])
    expect(rotationMessage?.payload.name).toBe(
      "Display: Rotation",
    )
  })

  test("every message is retained with a device-scoped unique_id", () => {
    messages.forEach((message) => {
      expect(message.isRetained).toBe(true)
      expect(message.payload.unique_id).toContain(
        "inkcast_inky-phat_",
      )
    })
  })

  test("the image entity points at the device image topic", () => {
    const imageMessage = messages.find((message) =>
      message.topic.startsWith("homeassistant/image/"),
    )

    expect(imageMessage?.payload.image_topic).toBe(
      "inkcast/inky-phat/image",
    )
    expect(imageMessage?.payload.content_type).toBe(
      "image/png",
    )
  })

  test("the select lists the provided views", () => {
    const selectMessage = messages.find((message) =>
      message.topic.startsWith("homeassistant/select/"),
    )

    expect(selectMessage?.payload.options).toEqual([
      "Now Playing (Dashboard)",
      "Clock",
    ])
  })

  test("respects a custom discovery prefix + node id", () => {
    const custom = buildDiscoveryMessages({
      device: PHAT_DEVICE,
      viewNames: ["Clock"],
      config: { discoveryPrefix: "ha", nodeId: "ink" },
    })

    expect(custom[0].topic).toBe(
      "ha/image/ink/inky-phat_screen/config",
    )
  })
})

describe("battery entities", () => {
  const buildPayloads = (
    device: typeof PHAT_DEVICE,
  ): Record<string, Record<string, unknown>> =>
    Object.fromEntries(
      buildDiscoveryMessages({
        device,
        viewNames: ["Agenda"],
      }).map((message) => [
        message.topic,
        message.payload as Record<string, unknown>,
      ]),
    )

  /*
   * Every panel in the fleet but one. A panel with no cell that published
   * these would show a permanently unknown battery on a display that is simply
   * plugged in.
   */
  test("a panel with no cell publishes none of them", () => {
    const topics = Object.keys(buildPayloads(PHAT_DEVICE))

    expect(
      topics.filter((topic) => topic.includes("battery")),
    ).toEqual([])
    expect(
      topics.filter((topic) =>
        topic.includes("on_battery"),
      ),
    ).toEqual([])
  })

  const BATTERY_DEVICE = {
    ...PHAT_DEVICE,
    hasBattery: true,
  }

  test("a panel with a cell gets percent, volts and on-battery", () => {
    const payloads = buildPayloads(BATTERY_DEVICE)

    expect(
      payloads[
        "homeassistant/sensor/inkcast/inky-phat_battery/config"
      ],
    ).toMatchObject({
      name: "Battery",
      unique_id: "inkcast_inky-phat_battery",
      state_topic: "inkcast/inky-phat/battery",
      value_template: "{{ value_json.percent }}",
      device_class: "battery",
      unit_of_measurement: "%",
    })
    expect(
      payloads[
        "homeassistant/sensor/inkcast/inky-phat_battery_voltage/config"
      ],
    ).toMatchObject({
      device_class: "voltage",
      unit_of_measurement: "V",
      value_template: "{{ value_json.volts }}",
    })
    expect(
      payloads[
        "homeassistant/binary_sensor/inkcast/inky-phat_on_battery/config"
      ],
    ).toMatchObject({
      name: "On battery",
      value_template:
        "{{ 'ON' if value_json.isOnBattery else 'OFF' }}",
    })
  })

  /*
   * All three read the PANEL's retained topic. CastKit republishing a copy
   * would add a second writer, a staleness window, and no way to tell which of
   * the two was right.
   */
  test("every one reads the panel's own topic", () => {
    const payloads = buildPayloads(BATTERY_DEVICE)

    for (const topic of Object.keys(payloads)) {
      if (!topic.includes("battery")) {
        continue
      }
      expect(payloads[topic]).toMatchObject({
        state_topic: "inkcast/inky-phat/battery",
        entity_category: "diagnostic",
      })
      expect(payloads[topic]).not.toHaveProperty(
        "command_topic",
      )
    }
  })

  /*
   * Home Assistant has no binary-sensor device class that means this:
   * `battery` is ON-means-LOW and `power`/`plug` are ON-means-MAINS-PRESENT,
   * so any of them would make the entity read as the opposite of what the
   * panel published.
   */
  test("on-battery claims no device class", () => {
    expect(
      buildPayloads(BATTERY_DEVICE)[
        "homeassistant/binary_sensor/inkcast/inky-phat_on_battery/config"
      ],
    ).not.toHaveProperty("device_class")
  })
})
