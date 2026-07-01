import { readFileSync } from "node:fs"
import mqtt from "mqtt"
import type { MqttConfig } from "../config/env.ts"

/**
 * Thin MQTT client wrapper for the Inkcast bridge. Connects with a Last-Will on
 * the bridge availability topic (so HA marks everything offline if the server
 * dies), publishes discovery/image/state, and dispatches command messages back
 * to a handler.
 *
 * If no broker URL is configured it returns a no-op publisher, so the server
 * still boots and serves HTTP without MQTT (dev / no-HA mode). Supports both
 * plaintext (`mqtt://…:1883`) and TLS (`mqtts://…:8883`, optional CA +
 * `rejectUnauthorized`) — no client cert, matching the broker's setup.
 */

export type CommandHandler = (params: {
  topic: string
  payload: string
}) => void | Promise<void>

export type MqttPublisher = {
  isEnabled: boolean
  publish: (params: {
    topic: string
    payload: string | Uint8Array
    isRetained?: boolean
  }) => Promise<void>
  subscribe: (params: {
    topics: string[]
    handler: CommandHandler
  }) => Promise<void>
  close: () => Promise<void>
}

const createNoopPublisher = () => ({
  isEnabled: false,
  publish: async () => {},
  subscribe: async () => {},
  close: async () => {},
})

export const createMqttPublisher = async ({
  config,
  availabilityTopic,
}: {
  config: MqttConfig
  availabilityTopic: string
}): Promise<MqttPublisher> => {
  if (!config.url) {
    console.log("[mqtt] no MQTT_URL set — MQTT disabled")
    return createNoopPublisher()
  }

  const client = await mqtt.connectAsync(config.url, {
    username: config.username || undefined,
    password: config.password || undefined,
    ca: config.caFile
      ? [readFileSync(config.caFile)]
      : undefined,
    rejectUnauthorized: config.isRejectUnauthorized,
    will: {
      topic: availabilityTopic,
      payload: Buffer.from("offline"),
      retain: true,
      qos: 1,
    },
  })

  await client.publishAsync(availabilityTopic, "online", {
    retain: true,
    qos: 1,
  })
  console.log(`[mqtt] connected to ${config.url}`)

  return {
    isEnabled: true,
    publish: async ({
      topic,
      payload,
      isRetained = false,
    }) => {
      await client.publishAsync(topic, payload as never, {
        retain: isRetained,
        qos: 1,
      })
    },
    subscribe: async ({ topics, handler }) => {
      client.on("message", (topic, payloadBuffer) => {
        void handler({
          topic,
          payload: payloadBuffer.toString(),
        })
      })
      await client.subscribeAsync(topics, { qos: 1 })
    },
    close: async () => {
      await client.publishAsync(
        availabilityTopic,
        "offline",
        {
          retain: true,
          qos: 1,
        },
      )
      await client.endAsync()
    },
  }
}
