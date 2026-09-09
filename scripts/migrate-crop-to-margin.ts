/**
 * One-shot migration for the `crop_*` -> `margin_*` rename.
 *
 * The old `Display: Crop {edge}` numbers never cropped anything. They said how
 * far the mat overlaps the panel, and every view is laid out inside what is
 * left. That is a margin, so they are now `Display: Margin {edge}`. A real crop
 * arrived at the same time under `Photo Frame: Crop {edge}`
 * (`photo_crop_*`), which is why the new crop does NOT reuse the `crop_*`
 * slug — reusing it would have read every mat as a zoom on the first boot.
 *
 * Retained MQTT is this server's persistence layer, so the values live in the
 * broker, not in a config file. Run in two phases, around the deploy:
 *
 *   1. `copy`    — BEFORE the deploy. Writes every `crop_<edge>` value to
 *                  `margin_<edge>`, and leaves the old topic alone, so the
 *                  running (old) build keeps working.
 *   2. `cleanup` — AFTER the deploy is verified. Clears the retained
 *                  `crop_<edge>` values and the old discovery configs, which
 *                  is what removes the orphaned entities from Home Assistant.
 *
 * Both phases are idempotent. `copy` never overwrites a `margin_<edge>` that
 * already holds a value, so re-running it cannot clobber a hand-tuned mat.
 *
 *   yarn tsx scripts/migrate-crop-to-margin.ts copy
 *   yarn tsx scripts/migrate-crop-to-margin.ts cleanup
 */
import mqtt from "mqtt"

const EDGES = ["top", "right", "bottom", "left"] as const

const BASE_TOPIC = process.env.MQTT_BASE_TOPIC ?? "inkcast"
const NODE_ID = process.env.MQTT_NODE_ID ?? "inkcast"
const DISCOVERY_PREFIX =
  process.env.MQTT_DISCOVERY_PREFIX ?? "homeassistant"

/** How long to wait for the broker to replay its retained messages. */
const RETAINED_SETTLE_MS = 6_000

const phase = process.argv[2]

if (phase !== "copy" && phase !== "cleanup") {
  console.error(
    "usage: migrate-crop-to-margin.ts <copy|cleanup>",
  )
  process.exit(1)
}

const client = await mqtt.connectAsync(
  process.env.MQTT_URL ?? "",
  {
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
    rejectUnauthorized:
      process.env.MQTT_REJECT_UNAUTHORIZED !== "false",
  },
)

/** Retained values seen, keyed by full topic. */
const retainedByTopic = new Map<string, string>()

client.on("message", (topic, payload, packet) => {
  if (!packet.retain) {
    return
  }
  retainedByTopic.set(topic, payload.toString())
})

// An MQTT wildcard has to fill a whole topic level, so `crop_+` is not a legal
// filter. Take every per-device topic and pick the edges out in code.
await client.subscribeAsync(`${BASE_TOPIC}/+/+`)
await client.subscribeAsync(
  `${DISCOVERY_PREFIX}/number/${NODE_ID}/+/config`,
)

await new Promise((resolve) =>
  setTimeout(resolve, RETAINED_SETTLE_MS),
)

/**
 * Every retained `<base>/<deviceId>/<slug>_<edge>` topic. Anchored on a slash
 * before the slug so `photo_crop_top` can never be mistaken for `crop_top` —
 * the new crop control must survive the cleanup that removes the old one.
 */
const getEdgeTopics = (slug: string) => {
  const pattern = new RegExp(
    `^${BASE_TOPIC}/[^/]+/${slug}_(${EDGES.join("|")})$`,
  )
  return Array.from(retainedByTopic.keys()).filter(
    (topic) => pattern.test(topic),
  )
}

if (phase === "copy") {
  const oldTopics = getEdgeTopics("crop")
  console.log(
    `found ${oldTopics.length} retained crop_* value(s)`,
  )

  for (const oldTopic of oldTopics) {
    const value = retainedByTopic.get(oldTopic) ?? ""
    const newTopic = oldTopic.replace(
      /\/crop_(top|right|bottom|left)$/,
      "/margin_$1",
    )
    const existing = retainedByTopic.get(newTopic)

    if (existing !== undefined && existing !== "") {
      console.log(
        `  skip  ${newTopic} (already holds "${existing}")`,
      )
      continue
    }

    await client.publishAsync(newTopic, value, {
      retain: true,
      qos: 1,
    })
    console.log(
      `  copy  ${oldTopic} -> ${newTopic} = ${value}`,
    )
  }
}

if (phase === "cleanup") {
  const oldTopics = getEdgeTopics("crop")
  console.log(
    `clearing ${oldTopics.length} retained crop_* value(s)`,
  )

  for (const oldTopic of oldTopics) {
    // An empty retained payload is how MQTT deletes a retained message.
    await client.publishAsync(oldTopic, "", {
      retain: true,
      qos: 1,
    })
    console.log(`  clear ${oldTopic}`)
  }

  // The discovery config is what makes the entity exist in Home Assistant;
  // clearing it retained is what removes the orphaned `..._crop_top` numbers.
  const oldDiscovery = Array.from(
    retainedByTopic.keys(),
  ).filter((topic) =>
    /(?<!photo)_crop_(top|right|bottom|left)\/config$/.test(
      topic,
    ),
  )
  console.log(
    `clearing ${oldDiscovery.length} orphaned discovery config(s)`,
  )

  for (const topic of oldDiscovery) {
    await client.publishAsync(topic, "", {
      retain: true,
      qos: 1,
    })
    console.log(`  clear ${topic}`)
  }
}

await client.endAsync()
console.log(`${phase} done`)
