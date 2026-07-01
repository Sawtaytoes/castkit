import { readFileSync } from "node:fs"
import {
  type DeviceMetadata,
  DITHER_ALGORITHMS,
  SEED_DEVICES,
} from "@inkcast/core/devices/device"
import {
  E6_DEFAULT_PALETTE,
  MONO_PALETTE,
} from "@inkcast/core/panels/palette"
import { z } from "zod"

/**
 * Runtime configuration, validated from environment variables. Everything
 * house-specific (hostnames, credentials, real device MACs, TLS material) lives
 * here and comes from the gitignored `.env` / device-config file — never from
 * committed source. See `.env.example`.
 */

const EnvSchema = z.object({
  PORT: z.coerce.number().default(8788),
  INKCAST_API_TOKEN: z.string().default(""),
  INKCAST_RENDER_ENGINE: z
    .enum(["chromium", "satori"])
    .default("chromium"),
  INKCAST_DEVICES_FILE: z.string().optional(),
  MQTT_URL: z.string().default(""),
  MQTT_USERNAME: z.string().default(""),
  MQTT_PASSWORD: z.string().default(""),
  MQTT_CA_FILE: z.string().optional(),
  MQTT_REJECT_UNAUTHORIZED: z
    .enum(["true", "false"])
    .default("true"),
  MQTT_DISCOVERY_PREFIX: z
    .string()
    .default("homeassistant"),
  MQTT_NODE_ID: z.string().default("inkcast"),
  MQTT_BASE_TOPIC: z.string().default("inkcast"),
})

/**
 * A device as written in the gitignored devices file. Palette is derived from
 * `colourMode`, so a real deployment never has to hand-write RGB triples.
 */
const DeviceConfigSchema = z.object({
  id: z.string(),
  label: z.string(),
  mac: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  colourMode: z.enum(["mono", "e6"]),
  rotation: z
    .union([
      z.literal(0),
      z.literal(90),
      z.literal(180),
      z.literal(270),
    ])
    .default(0),
  ditherProfile: z
    .object({
      algorithm: z.enum(DITHER_ALGORITHMS),
      supersampleFactor: z.number().positive(),
    })
    .default({
      algorithm: "floyd-steinberg",
      supersampleFactor: 2,
    }),
})

const expandDevice = (
  deviceConfig: z.infer<typeof DeviceConfigSchema>,
) => ({
  ...deviceConfig,
  palette:
    deviceConfig.colourMode === "mono"
      ? MONO_PALETTE
      : E6_DEFAULT_PALETTE,
})

/** Load the real devices from the config file, or fall back to the examples. */
const loadDevices = (devicesFile: string | undefined) => {
  if (!devicesFile) {
    return SEED_DEVICES
  }

  const parsed = z
    .array(DeviceConfigSchema)
    .parse(JSON.parse(readFileSync(devicesFile, "utf8")))

  return parsed.map(expandDevice)
}

export type MqttConfig = {
  url: string
  username: string
  password: string
  caFile: string | undefined
  isRejectUnauthorized: boolean
  discoveryPrefix: string
  nodeId: string
  baseTopic: string
}

export type InkcastConfig = {
  port: number
  apiToken: string
  renderEngine: "chromium" | "satori"
  devices: readonly DeviceMetadata[]
  mqtt: MqttConfig
}

/** Parse + validate configuration from `process.env`. Throws on bad input. */
export const loadConfig = (
  environment: NodeJS.ProcessEnv = process.env,
): InkcastConfig => {
  const parsed = EnvSchema.parse(environment)

  return {
    port: parsed.PORT,
    apiToken: parsed.INKCAST_API_TOKEN,
    renderEngine: parsed.INKCAST_RENDER_ENGINE,
    devices: loadDevices(parsed.INKCAST_DEVICES_FILE),
    mqtt: {
      url: parsed.MQTT_URL,
      username: parsed.MQTT_USERNAME,
      password: parsed.MQTT_PASSWORD,
      caFile: parsed.MQTT_CA_FILE,
      isRejectUnauthorized:
        parsed.MQTT_REJECT_UNAUTHORIZED === "true",
      discoveryPrefix: parsed.MQTT_DISCOVERY_PREFIX,
      nodeId: parsed.MQTT_NODE_ID,
      baseTopic: parsed.MQTT_BASE_TOPIC,
    },
  }
}
