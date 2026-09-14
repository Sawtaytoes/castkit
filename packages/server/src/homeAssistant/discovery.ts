import {
  type DeviceMetadata,
  DITHER_ALGORITHMS,
} from "@castkit/core/devices/device"
import type {
  DiscoveryMessage,
  HaDiscoveryConfig,
} from "@castkit/shared/discovery/types"

/**
 * Home Assistant MQTT-discovery payloads for an Inkcast device.
 *
 * Publishing these (retained) to the discovery topics makes HA's built-in MQTT
 * integration auto-create, per display:
 *   - an **Image** entity (see what the display is currently showing in HA),
 *   - a **Select** (switch the active view),
 *   - a **Button** (force a refresh),
 *   - a diagnostic **Sensor** (last-render time).
 * No custom HACS integration to maintain (the locked HA-integration approach).
 *
 * This module is pure — it only builds `{ topic, payload }` messages. The thin
 * MQTT client that actually publishes them lands with the broker credentials.
 */

/**
 * The generic discovery shapes + the bridge availability topic moved to
 * `@castkit/shared` (both client modes use them); re-exported so existing
 * import sites keep working.
 */
export {
  buildAvailabilityTopic,
  type DiscoveryMessage,
  type HaDiscoveryConfig,
} from "@castkit/shared/discovery/types"

import { buildAvailabilityTopic } from "@castkit/shared/discovery/types"

/** Runtime topics for a device (image, commands, state). */
export const buildDeviceTopics = ({
  baseTopic = "inkcast",
  device,
}: {
  baseTopic?: string
  device: DeviceMetadata
}) => {
  const base = `${baseTopic}/${device.id}`

  return {
    image: `${base}/image`,
    // Render-URL topic for "http-pull" panels (see DeviceMetadata.imageDelivery):
    // a single-use HTTPS URL the panel fetches, published non-retained per push.
    imageUrl: `${base}/image_url`,
    refreshCommand: `${base}/refresh/set`,
    viewCommand: `${base}/view/set`,
    viewState: `${base}/view`,
    lastRender: `${base}/last_render`,
    // View data HA pushes to this display (retained). Inkcast renders what it's
    // handed; it never reads HA. See docs/decisions/
    // 2026-07-04-inkcast-renders-ha-pushed-data-not-reads-ha.md.
    nowPlayingDataCommand: `${base}/now_playing/set`,
    weatherDataCommand: `${base}/weather/set`,
    agendaDataCommand: `${base}/agenda/set`,
    photoPeopleCommand: `${base}/photo_people/set`,
    photoPeopleState: `${base}/photo_people`,
    photoQueryCommand: `${base}/photo_query/set`,
    photoQueryState: `${base}/photo_query`,
    clockTimezoneCommand: `${base}/clock_timezone/set`,
    clockTimezoneState: `${base}/clock_timezone`,
    clockTimeFormatCommand: `${base}/clock_time_format/set`,
    clockTimeFormatState: `${base}/clock_time_format`,
    clockDateStyleCommand: `${base}/clock_date_style/set`,
    clockDateStyleState: `${base}/clock_date_style`,
    photoIntervalCommand: `${base}/photo_interval/set`,
    photoIntervalState: `${base}/photo_interval`,
    photoRecencyCommand: `${base}/photo_recency/set`,
    photoRecencyState: `${base}/photo_recency`,
    photoPeopleMinimumCommand: `${base}/photo_people_minimum/set`,
    photoPeopleMinimumState: `${base}/photo_people_minimum`,
    photoFormatCommand: `${base}/photo_format/set`,
    photoFormatState: `${base}/photo_format`,
    photoQualityCommand: `${base}/photo_quality/set`,
    photoQualityState: `${base}/photo_quality`,
    photoNextCommand: `${base}/photo_next/set`,
    photoPreviousCommand: `${base}/photo_previous/set`,
    ditherCommand: `${base}/dither/set`,
    ditherState: `${base}/dither`,
    rotationCommand: `${base}/rotation/set`,
    rotationState: `${base}/rotation`,
    // ⚠️ The TOPIC keeps the British spelling on purpose. The identifier is
    // American, the wire is not, and the two are allowed to differ.
    //
    // Home Assistant has a retained `select` entity bound to this topic, and
    // every automation and dashboard card that names it. Renaming the topic
    // silently stops matching, and the retained value on the old topic lives
    // on the broker until somebody deletes it. Renaming is a coordinated
    // migration with the Home Assistant side, not a spelling sweep
    // (see the workspace decision 2026-09-14-we-write-american-english…).
    colorModeCommand: `${base}/colour_mode/set`,
    colorModeState: `${base}/colour_mode`,
    brightnessCommand: `${base}/brightness/set`,
    brightnessState: `${base}/brightness`,
    saturationCommand: `${base}/saturation/set`,
    saturationState: `${base}/saturation`,
    marginTopCommand: `${base}/margin_top/set`,
    marginTopState: `${base}/margin_top`,
    marginRightCommand: `${base}/margin_right/set`,
    marginRightState: `${base}/margin_right`,
    marginBottomCommand: `${base}/margin_bottom/set`,
    marginBottomState: `${base}/margin_bottom`,
    marginLeftCommand: `${base}/margin_left/set`,
    marginLeftState: `${base}/margin_left`,
    // Photo crop. A NEW slug on purpose: `crop_*` used to hold the margins,
    // and reusing it would have read every mat as a zoom on the first boot.
    photoCropTopCommand: `${base}/photo_crop_top/set`,
    photoCropTopState: `${base}/photo_crop_top`,
    photoCropRightCommand: `${base}/photo_crop_right/set`,
    photoCropRightState: `${base}/photo_crop_right`,
    photoCropBottomCommand: `${base}/photo_crop_bottom/set`,
    photoCropBottomState: `${base}/photo_crop_bottom`,
    photoCropLeftCommand: `${base}/photo_crop_left/set`,
    photoCropLeftState: `${base}/photo_crop_left`,
    // Master pause. OFF = hold the last frame and skip every render/push.
    updatesCommand: `${base}/updates/set`,
    updatesState: `${base}/updates`,
    // Telemetry the PANEL writes, not a knob CastKit sets. One retained JSON
    // message holding `volts`, `percent` and `isOnBattery`, published by the
    // firmware every five minutes. CastKit points Home Assistant straight at
    // it rather than re-publishing a copy, so there is one writer and no way
    // for the two to disagree.
    battery: `${base}/battery`,
  }
}

/** Server-wide (per-install, not per-device) config topics. */
export const buildGlobalTopics = (
  baseTopic = "inkcast",
) => ({
  /** Global default clock timezone (IANA name; empty = process `TZ`). */
  clockTimezoneCommand: `${baseTopic}/clock_timezone/set`,
  clockTimezoneState: `${baseTopic}/clock_timezone`,
  /** Global default clock time format (12-hour / 24-hour). */
  clockTimeFormatCommand: `${baseTopic}/clock_time_format/set`,
  clockTimeFormatState: `${baseTopic}/clock_time_format`,
  /** Global default clock date style (Long / Numeric). */
  clockDateStyleCommand: `${baseTopic}/clock_date_style/set`,
  clockDateStyleState: `${baseTopic}/clock_date_style`,
  /** Global default Photo Frame rotation interval, minutes. */
  photoIntervalCommand: `${baseTopic}/photo_interval/set`,
  photoIntervalState: `${baseTopic}/photo_interval`,
  /** Global default Photo Frame recency half-life, days. */
  photoRecencyCommand: `${baseTopic}/photo_recency/set`,
  photoRecencyState: `${baseTopic}/photo_recency`,
  photoPeopleMinimumCommand: `${baseTopic}/photo_people_minimum/set`,
  photoPeopleMinimumState: `${baseTopic}/photo_people_minimum`,
  /** Global default Photo Frame wire format. */
  photoFormatCommand: `${baseTopic}/photo_format/set`,
  photoFormatState: `${baseTopic}/photo_format`,
  /** Global default Photo Frame lossy quality (1–100). */
  photoQualityCommand: `${baseTopic}/photo_quality/set`,
  photoQualityState: `${baseTopic}/photo_quality`,
})

/** The HA-facing color-mode option strings (double as MQTT payloads). */
export const COLOR_MODE_OPTIONS = [
  "Color",
  "Black & White",
] as const

/**
 * HA-facing panel-rotation option strings (double as MQTT payloads). Clockwise
 * degrees the server applies before the panel draws — corrects a remounted or
 * upside-down panel live.
 */
export const ROTATION_OPTIONS = [
  "0",
  "90",
  "180",
  "270",
] as const

/**
 * HA-facing Photo Frame format options (double as MQTT payloads). The global
 * default select offers the three real formats; a per-device select prepends
 * "Auto" (= inherit the global default). WebP is listed for future ARMv7+/ARMv8
 * photo panels — it crashes ARMv6 Pis on decode (see the JPEG-not-WebP decision
 * record), so the shipped default stays JPEG.
 */
export const GLOBAL_PHOTO_FORMAT_OPTIONS = [
  "JPEG",
  "WebP",
  "PNG",
] as const

export const PHOTO_FORMAT_OPTIONS = [
  "Auto",
  ...GLOBAL_PHOTO_FORMAT_OPTIONS,
] as const

/**
 * HA-facing clock time-format options (double as MQTT payloads). The global
 * default select offers the two real formats; a per-device select prepends
 * "Auto" (= inherit the global default).
 */
export const GLOBAL_CLOCK_TIME_FORMAT_OPTIONS = [
  "12-hour",
  "24-hour",
] as const

export const CLOCK_TIME_FORMAT_OPTIONS = [
  "Auto",
  ...GLOBAL_CLOCK_TIME_FORMAT_OPTIONS,
] as const

/** HA-facing clock date-style options (double as MQTT payloads). */
export const GLOBAL_CLOCK_DATE_STYLE_OPTIONS = [
  "Long",
  "Numeric",
] as const

export const CLOCK_DATE_STYLE_OPTIONS = [
  "Auto",
  ...GLOBAL_CLOCK_DATE_STYLE_OPTIONS,
] as const

/** The HA `device` block that ties every entity to one physical display. */
const buildDeviceBlock = (device: DeviceMetadata) => ({
  identifiers: [`inkcast_${device.id}`],
  connections: [["mac", device.mac]],
  name: device.label,
  manufacturer: "CastKit",
  model: `${device.colorMode} ${device.width}×${device.height}`,
})

/**
 * The three entities a panel with a cell adds to its own Home Assistant device.
 *
 * Empty for every panel without one, which is the whole fleet except the
 * M5Paper. A `hasBattery: false` panel that published these would show a
 * permanently unknown battery on a display that is simply plugged in.
 *
 * ⚠️ These read the PANEL's topic directly. CastKit does not republish the
 * values: the firmware already publishes them retained, and a copy would add a
 * second writer, a staleness window, and a way for the two to disagree with no
 * way to tell which was right.
 *
 * They are all `entity_category: "diagnostic"` on purpose. A wired panel's cell
 * is a UPS, not something anybody watches, and `isOnBattery` in particular must
 * not look like an alert source — on a device with no VBUS sense line it is
 * inferred from the cell voltage and lags by hours.
 */
const buildBatteryDiscoveryMessages = ({
  availability,
  device,
  deviceBlock,
  discoveryTopic,
  topics,
}: {
  availability: Record<string, string>
  device: DeviceMetadata
  deviceBlock: ReturnType<typeof buildDeviceBlock>
  discoveryTopic: (
    component: string,
    entity: string,
  ) => string
  topics: ReturnType<typeof buildDeviceTopics>
}): DiscoveryMessage[] => {
  if (!device.hasBattery) {
    return []
  }

  return [
    {
      topic: discoveryTopic("sensor", "battery"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Battery",
        unique_id: `inkcast_${device.id}_battery`,
        state_topic: topics.battery,
        value_template: "{{ value_json.percent }}",
        device_class: "battery",
        state_class: "measurement",
        unit_of_measurement: "%",
        suggested_display_precision: 0,
        entity_category: "diagnostic",
        device: deviceBlock,
      },
    },
    {
      /*
       * The volts are the honest reading and the only one that survives a
       * wrong calibration, so they get their own entity rather than hiding as
       * an attribute of the percentage. The M5Paper's percentage is a flat
       * linear map over an uncalibrated ADC today.
       */
      topic: discoveryTopic("sensor", "battery_voltage"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Battery voltage",
        unique_id: `inkcast_${device.id}_battery_voltage`,
        state_topic: topics.battery,
        value_template: "{{ value_json.volts }}",
        device_class: "voltage",
        state_class: "measurement",
        unit_of_measurement: "V",
        suggested_display_precision: 2,
        entity_category: "diagnostic",
        device: deviceBlock,
      },
    },
    {
      /*
       * No `device_class`. Home Assistant's binary-sensor classes do not have
       * one that means this: `battery` is ON-means-LOW, `power` and `plug` are
       * ON-means-MAINS-PRESENT, and dressing the field up as any of them would
       * make the entity read as the opposite of what the panel published.
       * The model's own name is the clearest thing to call it.
       */
      topic: discoveryTopic("binary_sensor", "on_battery"),
      isRetained: true,
      payload: {
        ...availability,
        name: "On battery",
        unique_id: `inkcast_${device.id}_on_battery`,
        state_topic: topics.battery,
        value_template:
          "{{ 'ON' if value_json.isOnBattery else 'OFF' }}",
        entity_category: "diagnostic",
        device: deviceBlock,
      },
    },
  ]
}

/**
 * Build every retained discovery message for one device. `viewNames` populates
 * the Select's options (the views this device can show).
 */
export const buildDiscoveryMessages = ({
  device,
  viewNames,
  config = {},
}: {
  device: DeviceMetadata
  viewNames: readonly string[]
  config?: HaDiscoveryConfig
}): DiscoveryMessage[] => {
  const discoveryPrefix =
    config.discoveryPrefix ?? "homeassistant"
  const nodeId = config.nodeId ?? "inkcast"
  const topics = buildDeviceTopics({
    baseTopic: config.baseTopic,
    device,
  })
  const deviceBlock = buildDeviceBlock(device)

  const availability = {
    availability_topic: buildAvailabilityTopic(
      config.baseTopic,
    ),
    payload_available: "online",
    payload_not_available: "offline",
  }

  const discoveryTopic = (
    component: string,
    entity: string,
  ) =>
    `${discoveryPrefix}/${component}/${nodeId}/${device.id}_${entity}/config`

  return [
    {
      topic: discoveryTopic("image", "screen"),
      isRetained: true,
      payload: {
        ...availability,
        // `null` marks this as the device's main entity, so HA names it after
        // the device alone ("Kitchen Counter ePaper Display") instead of
        // suffixing it ("… ePaper Display Screen"). "Screen" is also the wrong
        // word for a display — see the workspace naming decisions.
        name: null,
        unique_id: `inkcast_${device.id}_screen`,
        image_topic: topics.image,
        content_type: "image/png",
        device: deviceBlock,
      },
    },
    {
      topic: discoveryTopic("select", "view"),
      isRetained: true,
      payload: {
        ...availability,
        name: "View",
        unique_id: `inkcast_${device.id}_view`,
        options: Array.from(viewNames),
        command_topic: topics.viewCommand,
        state_topic: topics.viewState,
        device: deviceBlock,
      },
    },
    {
      topic: discoveryTopic("button", "refresh"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Refresh",
        unique_id: `inkcast_${device.id}_refresh`,
        command_topic: topics.refreshCommand,
        payload_press: "refresh",
        device: deviceBlock,
      },
    },
    {
      // Master pause — an operational control, not a config knob, so it stays
      // in the device's primary controls next to View and Refresh. OFF freezes
      // the panel on its current frame: every render path is skipped, and
      // ePaper holds the last image at zero power. Turning it back ON renders
      // immediately, so a clock view never resumes showing a stale time.
      topic: discoveryTopic("switch", "updates"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Updates",
        unique_id: `inkcast_${device.id}_updates`,
        command_topic: topics.updatesCommand,
        state_topic: topics.updatesState,
        icon: "mdi:refresh-auto",
        device: deviceBlock,
      },
    },
    {
      // Config entities are name-prefixed by what they affect ("Display:",
      // "Photo Frame:") — HA has no custom config sub-sections, so the
      // prefix is what groups them on the device page.
      topic: discoveryTopic("select", "dither"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Display: Dither",
        unique_id: `inkcast_${device.id}_dither`,
        options: Array.from(DITHER_ALGORITHMS),
        command_topic: topics.ditherCommand,
        state_topic: topics.ditherState,
        entity_category: "config",
        device: deviceBlock,
      },
    },
    {
      // Mount orientation (clockwise degrees). Correct a remounted / upside-down
      // panel here — the panel Pi's own INKCAST_ROTATE must stay 0 or rotation
      // is applied twice.
      topic: discoveryTopic("select", "rotation"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Display: Rotation",
        unique_id: `inkcast_${device.id}_rotation`,
        options: Array.from(ROTATION_OPTIONS),
        command_topic: topics.rotationCommand,
        state_topic: topics.rotationState,
        entity_category: "config",
        device: deviceBlock,
      },
    },
    // B&W-on-a-color-panel only makes sense on color hardware.
    ...(device.colorMode === "spectra6"
      ? [
          {
            topic: discoveryTopic(
              "select",
              // Legacy on purpose — see colorModeCommand above.
              "colour_mode",
            ),
            isRetained: true as const,
            payload: {
              ...availability,
              name: "Display: Color mode",
              // ⚠️ NEVER change this string. Home Assistant keys the entity
              // off `unique_id`; a new value creates a SECOND entity and
              // orphans `select.<device>_colour_mode`, taking every dashboard
              // card and automation that names it with it.
              unique_id: `inkcast_${device.id}_colour_mode`,
              options: Array.from(COLOR_MODE_OPTIONS),
              command_topic: topics.colorModeCommand,
              state_topic: topics.colorModeState,
              entity_category: "config",
              device: deviceBlock,
            },
          },
        ]
      : []),
    {
      // Pre-dither brightness boost (ePaper panels read dark).
      topic: discoveryTopic("number", "brightness"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Display: Brightness",
        unique_id: `inkcast_${device.id}_brightness`,
        command_topic: topics.brightnessCommand,
        state_topic: topics.brightnessState,
        min: 50,
        max: 200,
        step: 5,
        unit_of_measurement: "%",
        entity_category: "config",
        device: deviceBlock,
      },
    },
    {
      topic: discoveryTopic("number", "saturation"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Display: Saturation",
        unique_id: `inkcast_${device.id}_saturation`,
        command_topic: topics.saturationCommand,
        state_topic: topics.saturationState,
        min: 50,
        max: 200,
        step: 5,
        unit_of_measurement: "%",
        entity_category: "config",
        device: deviceBlock,
      },
    },
    // Panel margin (px per edge): a physical mat overlaps the panel edges, so
    // EVERY view — photos included — is laid out inside what is left, and the
    // margin renders white. Nothing is cut off; the picture is made smaller.
    // The knob that DOES cut is "Photo Frame: Crop", further down.
    // Tunable live so a reframed unit (or a second, unmatted one) can differ.
    ...(
      [
        {
          edge: "top",
          command: topics.marginTopCommand,
          state: topics.marginTopState,
        },
        {
          edge: "right",
          command: topics.marginRightCommand,
          state: topics.marginRightState,
        },
        {
          edge: "bottom",
          command: topics.marginBottomCommand,
          state: topics.marginBottomState,
        },
        {
          edge: "left",
          command: topics.marginLeftCommand,
          state: topics.marginLeftState,
        },
      ] as const
    ).map((marginEdge) => ({
      topic: discoveryTopic(
        "number",
        `margin_${marginEdge.edge}`,
      ),
      isRetained: true as const,
      payload: {
        ...availability,
        name: `Display: Margin ${marginEdge.edge}`,
        unique_id: `inkcast_${device.id}_margin_${marginEdge.edge}`,
        command_topic: marginEdge.command,
        state_topic: marginEdge.state,
        min: 0,
        max: 200,
        step: 1,
        unit_of_measurement: "px",
        entity_category: "config",
        device: deviceBlock,
      },
    })),
    {
      // Which Immich people feed this device's Photo Frame view
      // (comma-separated names or person UUIDs). The retained state topic
      // doubles as the persistence layer.
      topic: discoveryTopic("text", "photo_people"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Photo Frame: People",
        unique_id: `inkcast_${device.id}_photo_people`,
        command_topic: topics.photoPeopleCommand,
        state_topic: topics.photoPeopleState,
        entity_category: "config",
        device: deviceBlock,
      },
    },
    {
      // Free-text Immich smart-search query ("green shirt"). Combines with
      // the people list; automatable from HA (holiday themes, bedtime
      // rotations, presence-driven switches).
      topic: discoveryTopic("text", "photo_query"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Photo Frame: Query",
        unique_id: `inkcast_${device.id}_photo_query`,
        command_topic: topics.photoQueryCommand,
        state_topic: topics.photoQueryState,
        entity_category: "config",
        device: deviceBlock,
      },
    },
    {
      // This device's clock timezone (an IANA name, e.g. America/Chicago).
      // Empty = inherit the global default on the Inkcast Server device.
      topic: discoveryTopic("text", "clock_timezone"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Clock: Timezone",
        unique_id: `inkcast_${device.id}_clock_timezone`,
        command_topic: topics.clockTimezoneCommand,
        state_topic: topics.clockTimezoneState,
        entity_category: "config",
        device: deviceBlock,
      },
    },
    {
      // This device's clock time format; "Auto" = inherit the global default.
      topic: discoveryTopic("select", "clock_time_format"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Clock: Time format",
        unique_id: `inkcast_${device.id}_clock_time_format`,
        command_topic: topics.clockTimeFormatCommand,
        state_topic: topics.clockTimeFormatState,
        options: [...CLOCK_TIME_FORMAT_OPTIONS],
        entity_category: "config",
        device: deviceBlock,
      },
    },
    {
      // This device's clock date style; "Auto" = inherit the global default.
      topic: discoveryTopic("select", "clock_date_style"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Clock: Date style",
        unique_id: `inkcast_${device.id}_clock_date_style`,
        command_topic: topics.clockDateStyleCommand,
        state_topic: topics.clockDateStyleState,
        options: [...CLOCK_DATE_STYLE_OPTIONS],
        entity_category: "config",
        device: deviceBlock,
      },
    },
    {
      // Per-device Photo Frame rotation interval. 0 = inherit the global
      // default on the Inkcast Server device (a number entity always carries a
      // value, so 0 is the "unset/inherit" sentinel — 0 minutes is meaningless
      // as a real interval).
      topic: discoveryTopic("number", "photo_interval"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Photo Frame: Rotation minutes",
        unique_id: `inkcast_${device.id}_photo_interval`,
        command_topic: topics.photoIntervalCommand,
        state_topic: topics.photoIntervalState,
        min: 0,
        max: 1440,
        step: 1,
        unit_of_measurement: "min",
        entity_category: "config",
        device: deviceBlock,
      },
    },
    {
      // Per-device Photo Frame recency half-life. 0 = inherit the global
      // default (same sentinel rationale as the rotation interval above).
      topic: discoveryTopic("number", "photo_recency"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Photo Frame: Recency half-life days",
        unique_id: `inkcast_${device.id}_photo_recency`,
        command_topic: topics.photoRecencyCommand,
        state_topic: topics.photoRecencyState,
        min: 0,
        max: 3650,
        step: 1,
        unit_of_measurement: "d",
        entity_category: "config",
        device: deviceBlock,
      },
    },
    {
      // Per-device people minimum: how many of "Photo Frame: People" an asset
      // must contain. 1 = any of them (the pre-knob behavior), the full name
      // count = all of them, in between = "at least K of N". 0 = inherit the
      // global default. A value nothing satisfies falls back to any-of rather
      // than blanking the frame.
      topic: discoveryTopic(
        "number",
        "photo_people_minimum",
      ),
      isRetained: true,
      payload: {
        ...availability,
        name: "Photo Frame: People minimum",
        unique_id: `inkcast_${device.id}_photo_people_minimum`,
        command_topic: topics.photoPeopleMinimumCommand,
        state_topic: topics.photoPeopleMinimumState,
        min: 0,
        max: 20,
        step: 1,
        entity_category: "config",
        device: deviceBlock,
      },
    },
    {
      // Per-device Photo Frame wire format. "Auto" = inherit the global default
      // on the Inkcast Server device. Only the photo (bleed) view uses it;
      // text/dithered views are always PNG.
      topic: discoveryTopic("select", "photo_format"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Photo Frame: Format",
        unique_id: `inkcast_${device.id}_photo_format`,
        options: Array.from(PHOTO_FORMAT_OPTIONS),
        command_topic: topics.photoFormatCommand,
        state_topic: topics.photoFormatState,
        entity_category: "config",
        device: deviceBlock,
      },
    },
    {
      // Per-device lossy quality for JPEG/WebP. 0 = inherit the global default
      // (a number entity always carries a value, so 0 is the "unset" sentinel).
      topic: discoveryTopic("number", "photo_quality"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Photo Frame: Quality",
        unique_id: `inkcast_${device.id}_photo_quality`,
        command_topic: topics.photoQualityCommand,
        state_topic: topics.photoQualityState,
        min: 0,
        max: 100,
        step: 1,
        unit_of_measurement: "%",
        entity_category: "config",
        device: deviceBlock,
      },
    },
    // Photo crop (px per edge, of the box a photo is composed into). Unlike the
    // margin above, this one CUTS: it throws pixels away and zooms what is left
    // to fill the frame. Photo views only — cropping a text view would scale an
    // already-rendered raster up and only blur the text. 0 = no crop.
    ...(
      [
        {
          edge: "top",
          command: topics.photoCropTopCommand,
          state: topics.photoCropTopState,
        },
        {
          edge: "right",
          command: topics.photoCropRightCommand,
          state: topics.photoCropRightState,
        },
        {
          edge: "bottom",
          command: topics.photoCropBottomCommand,
          state: topics.photoCropBottomState,
        },
        {
          edge: "left",
          command: topics.photoCropLeftCommand,
          state: topics.photoCropLeftState,
        },
      ] as const
    ).map((cropEdge) => ({
      topic: discoveryTopic(
        "number",
        `photo_crop_${cropEdge.edge}`,
      ),
      isRetained: true as const,
      payload: {
        ...availability,
        name: `Photo Frame: Crop ${cropEdge.edge}`,
        unique_id: `inkcast_${device.id}_photo_crop_${cropEdge.edge}`,
        command_topic: cropEdge.command,
        state_topic: cropEdge.state,
        min: 0,
        max: 200,
        step: 1,
        unit_of_measurement: "px",
        entity_category: "config",
        device: deviceBlock,
      },
    })),
    {
      topic: discoveryTopic("button", "photo_next"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Photo Frame: Next photo",
        unique_id: `inkcast_${device.id}_photo_next`,
        command_topic: topics.photoNextCommand,
        payload_press: "next",
        device: deviceBlock,
      },
    },
    {
      topic: discoveryTopic("button", "photo_previous"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Photo Frame: Previous photo",
        unique_id: `inkcast_${device.id}_photo_previous`,
        command_topic: topics.photoPreviousCommand,
        payload_press: "previous",
        device: deviceBlock,
      },
    },
    {
      topic: discoveryTopic("sensor", "last_render"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Last render",
        unique_id: `inkcast_${device.id}_last_render`,
        state_topic: topics.lastRender,
        device_class: "timestamp",
        entity_category: "diagnostic",
        device: deviceBlock,
      },
    },
    ...buildBatteryDiscoveryMessages({
      availability,
      device,
      deviceBlock,
      discoveryTopic,
      topics,
    }),
  ]
}

/**
 * Discovery messages for the server-wide "Inkcast Server" device — global
 * settings that aren't tied to one panel, exposed as normal HA entities so
 * they're editable, automatable, and visible (instead of hiding in env
 * vars). Retained state = persistence, exactly like the per-device knobs.
 */
export const buildGlobalDiscoveryMessages = (
  config: HaDiscoveryConfig = {},
): DiscoveryMessage[] => {
  const discoveryPrefix =
    config.discoveryPrefix ?? "homeassistant"
  const nodeId = config.nodeId ?? "inkcast"
  const topics = buildGlobalTopics(config.baseTopic)

  const availability = {
    availability_topic: buildAvailabilityTopic(
      config.baseTopic,
    ),
    payload_available: "online",
    payload_not_available: "offline",
  }
  const serverDeviceBlock = {
    // identifiers/unique_ids keep the historical "inkcast_" prefix so HA
    // doesn't recreate entities — only the display strings are CastKit.
    identifiers: ["inkcast_server"],
    name: "CastKit Server",
    manufacturer: "CastKit",
    model: "render server",
  }

  return [
    {
      // Global default clock timezone (IANA name) — used by any display whose
      // own "Clock: Timezone" is empty; empty here too = the process `TZ`.
      topic: `${discoveryPrefix}/text/${nodeId}/server_clock_timezone/config`,
      isRetained: true as const,
      payload: {
        ...availability,
        name: "Clock: Timezone",
        unique_id: "inkcast_server_clock_timezone",
        command_topic: topics.clockTimezoneCommand,
        state_topic: topics.clockTimezoneState,
        entity_category: "config",
        device: serverDeviceBlock,
      },
    },
    {
      // Global default clock time format — used by any display whose own
      // "Clock: Time format" is "Auto".
      topic: `${discoveryPrefix}/select/${nodeId}/server_clock_time_format/config`,
      isRetained: true as const,
      payload: {
        ...availability,
        name: "Clock: Time format",
        unique_id: "inkcast_server_clock_time_format",
        command_topic: topics.clockTimeFormatCommand,
        state_topic: topics.clockTimeFormatState,
        options: [...GLOBAL_CLOCK_TIME_FORMAT_OPTIONS],
        entity_category: "config",
        device: serverDeviceBlock,
      },
    },
    {
      // Global default clock date style — used by any display whose own
      // "Clock: Date style" is "Auto".
      topic: `${discoveryPrefix}/select/${nodeId}/server_clock_date_style/config`,
      isRetained: true as const,
      payload: {
        ...availability,
        name: "Clock: Date style",
        unique_id: "inkcast_server_clock_date_style",
        command_topic: topics.clockDateStyleCommand,
        state_topic: topics.clockDateStyleState,
        options: [...GLOBAL_CLOCK_DATE_STYLE_OPTIONS],
        entity_category: "config",
        device: serverDeviceBlock,
      },
    },
    {
      // Global default Photo Frame rotation interval (minutes) — used by any
      // display whose own "Photo Frame: Rotation minutes" is 0 (inherit).
      topic: `${discoveryPrefix}/number/${nodeId}/server_photo_interval/config`,
      isRetained: true as const,
      payload: {
        ...availability,
        name: "Photo Frame: Rotation minutes",
        unique_id: "inkcast_server_photo_interval",
        command_topic: topics.photoIntervalCommand,
        state_topic: topics.photoIntervalState,
        min: 1,
        max: 1440,
        step: 1,
        unit_of_measurement: "min",
        entity_category: "config",
        device: serverDeviceBlock,
      },
    },
    {
      // Global default Photo Frame recency half-life (days) — used by any
      // display whose own "Photo Frame: Recency half-life days" is 0 (inherit).
      topic: `${discoveryPrefix}/number/${nodeId}/server_photo_recency/config`,
      isRetained: true as const,
      payload: {
        ...availability,
        name: "Photo Frame: Recency half-life days",
        unique_id: "inkcast_server_photo_recency",
        command_topic: topics.photoRecencyCommand,
        state_topic: topics.photoRecencyState,
        min: 1,
        max: 3650,
        step: 1,
        unit_of_measurement: "d",
        entity_category: "config",
        device: serverDeviceBlock,
      },
    },
    {
      // Global default people minimum — used by any display whose own "Photo
      // Frame: People minimum" is 0 (inherit).
      topic: `${discoveryPrefix}/number/${nodeId}/server_photo_people_minimum/config`,
      isRetained: true as const,
      payload: {
        ...availability,
        name: "Photo Frame: People minimum",
        unique_id: "inkcast_server_photo_people_minimum",
        command_topic: topics.photoPeopleMinimumCommand,
        state_topic: topics.photoPeopleMinimumState,
        min: 1,
        max: 20,
        step: 1,
        entity_category: "config",
        device: serverDeviceBlock,
      },
    },
    {
      // Global default Photo Frame wire format — used by any display whose own
      // "Photo Frame: Format" is "Auto" (inherit).
      topic: `${discoveryPrefix}/select/${nodeId}/server_photo_format/config`,
      isRetained: true as const,
      payload: {
        ...availability,
        name: "Photo Frame: Format",
        unique_id: "inkcast_server_photo_format",
        options: Array.from(GLOBAL_PHOTO_FORMAT_OPTIONS),
        command_topic: topics.photoFormatCommand,
        state_topic: topics.photoFormatState,
        entity_category: "config",
        device: serverDeviceBlock,
      },
    },
    {
      // Global default lossy quality (1–100) for JPEG/WebP — used by any display
      // whose own "Photo Frame: Quality" is 0 (inherit).
      topic: `${discoveryPrefix}/number/${nodeId}/server_photo_quality/config`,
      isRetained: true as const,
      payload: {
        ...availability,
        name: "Photo Frame: Quality",
        unique_id: "inkcast_server_photo_quality",
        command_topic: topics.photoQualityCommand,
        state_topic: topics.photoQualityState,
        min: 1,
        max: 100,
        step: 1,
        unit_of_measurement: "%",
        entity_category: "config",
        device: serverDeviceBlock,
      },
    },
  ]
}
