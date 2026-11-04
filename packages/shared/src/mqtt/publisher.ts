import { readFileSync } from "node:fs"
import mqtt, { type ISubscriptionMap } from "mqtt"

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
    /*
     * This wrapper resubscribes after a reconnect itself; see
     * `resubscribeAll` below for why mqtt.js must not.
     */
    resubscribe: false,
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

  /*
   * Every topic this client has asked for, so a reconnect can ask again.
   *
   * mqtt.js keeps its own list for this, and loses all of it at once: it
   * resends the whole list as ONE SUBSCRIBE packet, and when the broker
   * refuses any single topic in that packet's SUBACK, mqtt.js deletes every
   * topic the packet carried. The connection that was open keeps the topics
   * the broker did grant, so nothing looks wrong — until the next reconnect,
   * which then resubscribes to nothing. Every MQTT channel goes stale while
   * the client stays connected and keeps publishing its heartbeat. That
   * happened when a broker ACL change refused one topic for a single restart.
   *
   * So the list lives here, each topic is resent in its own packet, and a
   * refused topic stays on the list: one refusal costs only that topic, and
   * the next reconnect tries it again in case the broker now allows it.
   */
  const subscribedTopics = new Set<string>()

  const subscribeTopics = (topics: string[]) =>
    // mqtt.js types the flag as an intersection its own index signature
    // contradicts, so no object literal satisfies it without a cast.
    client.subscribeAsync({
      ...Object.fromEntries(
        topics.map((topic) => [topic, { qos: 1 }]),
      ),
      resubscribe: true,
    } as ISubscriptionMap)

  const resubscribeAll = () =>
    Promise.all(
      Array.from(subscribedTopics).map((topic) =>
        subscribeTopics([topic]).catch((error: unknown) => {
          console.error(
            `[mqtt] resubscribing to ${topic} failed`,
            error,
          )
        }),
      ),
    )

  // mqtt.js auto-reconnects; re-assert availability and every subscription on
  // each reconnect. The first connection resolved `connectAsync` before this
  // listener existed, so this runs only for reconnects.
  client.on("connect", () => {
    publishOnline().catch(() => {})
    void resubscribeAll()
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
    /*
     * ⚠️ A repeat subscription must reach the broker. The broker sends a
     * topic's retained message only in answer to a SUBSCRIBE, and a source
     * that restarts — which every channel edit does — subscribes again to get
     * back the retained value it lost with its old instance. A producer that
     * publishes only on change (a points service between scans) otherwise
     * leaves the channel waiting for hours. mqtt.js drops a SUBSCRIBE for a
     * topic on its own resubscribe list; that list stays empty while its
     * `resubscribe` option is off, and `subscribeTopics` also sends
     * `resubscribe: true`, so turning the option back on cannot bring the
     * drop back.
     */
    subscribe: async ({ topics, handler }) => {
      messageHandlers.add(handler)
      topics.forEach((topic) => {
        subscribedTopics.add(topic)
      })
      await subscribeTopics(topics)
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
