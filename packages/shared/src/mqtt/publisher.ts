import { readFileSync } from "node:fs"
import mqtt from "mqtt"

/**
 * Thin MQTT client wrapper for the CastKit bridge. Connects with a Last-Will on
 * the bridge availability topic (so HA marks everything offline if the server
 * dies), publishes discovery/image/state, and dispatches command messages back
 * to a handler.
 *
 * If no broker URL is configured it returns a no-op publisher, so the server
 * still boots and serves HTTP without MQTT (dev / no-HA mode). Supports both
 * plaintext (`mqtt://…:1883`) and TLS (`mqtts://…:8883`, optional CA +
 * `rejectUnauthorized`) — no client cert, matching the broker's setup.
 */

/** Broker-connection subset of the server's MQTT config. */
export type MqttConnectionConfig = {
  url: string
  username: string
  password: string
  caFile: string | undefined
  isRejectUnauthorized: boolean
}

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
  config: MqttConnectionConfig
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

  const publishOnline = () =>
    client.publishAsync(availabilityTopic, "online", {
      retain: true,
      qos: 1,
    })

  await publishOnline()
  console.log(`[mqtt] connected to ${config.url}`)

  // Availability heartbeat: another instance shutting down (or a stale LWT)
  // can overwrite the retained availability with "offline" even though this
  // server is alive and pushing — HA then ignores every push. Republishing
  // "online" each minute heals that within one interval.
  const heartbeatInterval = setInterval(() => {
    publishOnline().catch((error) => {
      console.error(
        "[mqtt] availability heartbeat failed",
        error,
      )
    })
  }, 60_000)

  // mqtt.js auto-reconnects; re-assert availability on every reconnect.
  client.on("connect", () => {
    publishOnline().catch(() => {})
  })

  /*
   * ONE `message` listener on the client, fanning out to the handlers.
   *
   * `subscribe` used to add a listener of its own per call. Every subscriber
   * already received every message and filtered by topic itself, so the extra
   * listeners bought nothing — and mqtt.js inherits Node's default limit of
   * ten, so the sixth source made the server log a
   * `MaxListenersExceededWarning` on every boot. Raising the limit would have
   * moved the number without removing the growth.
   *
   * A Set, not an array: registering the same handler twice is a mistake, not
   * a request to run it twice.
   */
  const messageHandlers = new Set<CommandHandler>()
  client.on("message", (topic, payloadBuffer) => {
    const payload = payloadBuffer.toString()
    messageHandlers.forEach((handler) => {
      void handler({ topic, payload })
    })
  })

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
      messageHandlers.add(handler)
      await client.subscribeAsync(topics, { qos: 1 })
    },
    close: async () => {
      clearInterval(heartbeatInterval)
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
