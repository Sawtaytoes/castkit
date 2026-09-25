import { builtinContractSchemas } from "@castkit/sdk/contracts"
import { expect, test } from "vitest"
import { sourceContext } from "./__fixtures__/sourceContext.ts"
import {
  createMqttSource,
  normalizeMqttPayload,
} from "./mqtt.ts"

test("MQTT sources subscribe once per named channel and never depend on a display", async () => {
  const context = sourceContext({
    channels: [
      {
        id: "desk",
        name: "Desk",
        sourceId: "source",
        type: "now-playing.v1",
        settings: {},
      },
    ],
  })
  const adapter = createMqttSource(context)
  await adapter.start?.()
  expect(context.mqtt.subscribe).toHaveBeenCalledWith(
    "castkit/channels/desk/set",
  )
  adapter.handleMqttMessage?.({
    topic: "castkit/channels/desk/set",
    payload: JSON.stringify({
      title: "Track",
      artist: "Artist",
      isPlaying: true,
      position: 30,
    }),
  })
  expect(context.publish).toHaveBeenCalledWith({
    channelId: "desk",
    data: {
      title: "Track",
      artist: "Artist",
      isPlaying: true,
      positionSeconds: 30,
    },
  })
  adapter.handleMqttMessage?.({
    topic: "castkit/channels/desk/set",
    payload: "malformed",
  })
  expect(context.reportError).toHaveBeenCalledTimes(1)
  adapter.dispose()
  expect(context.mqtt.unsubscribe).toHaveBeenCalledWith(
    "castkit/channels/desk/set",
  )
})
test("MQTT actions use explicitly configured commands and cannot replace the action", async () => {
  const context = sourceContext({
    channels: [
      {
        id: "desk",
        name: "Desk",
        sourceId: "source",
        type: "entities.v1",
        settings: {
          commandTopic: "example/control",
          actions: ["toggle"],
        },
      },
    ],
  })
  const adapter = createMqttSource(context)
  await expect(
    adapter.executeAction?.({
      channelId: "desk",
      action: "unlock",
      payload: {},
    }),
  ).rejects.toThrow("does not allow")
  await adapter.executeAction?.({
    channelId: "desk",
    action: "toggle",
    payload: { action: "unlock" },
  })
  expect(context.mqtt.publish).toHaveBeenCalledWith({
    topic: "example/control",
    payload: '{"action":"toggle"}',
    isRetained: false,
  })
  adapter.dispose()
})

test("Now Playing MQTT roundtrips its selected media entity", () => {
  const channel = {
    id: "media",
    name: "Media",
    sourceId: "source",
    type: "now-playing.v1",
    settings: {},
  }
  const context = sourceContext({ channels: [channel] })
  const adapter = createMqttSource(context)
  const data = {
    title: "Track",
    artist: "Artist",
    isPlaying: true,
    positionSeconds: 30,
    entityId: "media_player.example",
  }
  adapter.handleMqttMessage?.({
    topic: "castkit/channels/media/set",
    payload: JSON.stringify(data),
  })
  expect(context.publish).toHaveBeenCalledWith({
    channelId: "media",
    data: builtinContractSchemas["now-playing.v1"].parse(
      data,
    ),
  })
  expect(
    normalizeMqttPayload({
      type: channel.type,
      data: {
        ...data,
        entityId: undefined,
        entity_id: "media_player.legacy",
      },
    }),
  ).toMatchObject({ entityId: "media_player.legacy" })
  expect(
    normalizeMqttPayload({
      type: channel.type,
      data: { ...data, entityId: 42 },
    }),
  ).not.toHaveProperty("entityId")
  adapter.dispose()
})
