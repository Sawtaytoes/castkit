import { expect, test, vi } from "vitest"
import { sourceContext } from "./__fixtures__/sourceContext.ts"
import {
  createHomeAssistantSource,
  normalizeHomeAssistantEntity,
} from "./homeAssistant.ts"

test("HA data omits secret attributes and advertises only domain actions", () => {
  expect(
    normalizeHomeAssistantEntity({
      entity_id: "lock.front",
      state: "locked",
      attributes: {
        friendly_name: "Entry",
        access_token: "secret",
        entity_picture: "/api/camera?token=secret",
        battery_level: 60,
      },
    }),
  ).toEqual({
    id: "lock.front",
    name: "Entry",
    state: "locked",
    domain: "lock",
    attributes: { friendly_name: "Entry" },
    actions: ["lock", "unlock"],
  })
})
test("HA actions cannot target unbound entities or pass arbitrary service parameters", async () => {
  const fetchRequest = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => new Response("[]"))
  const context = sourceContext({ fetch: fetchRequest })
  const adapter = createHomeAssistantSource(context)
  await expect(
    adapter.executeAction?.({
      channelId: "channel",
      action: "turn_on",
      payload: { entityId: "light.other" },
    }),
  ).rejects.toThrow("does not allow")
  expect(fetchRequest).not.toHaveBeenCalled()
  await adapter.executeAction?.({
    channelId: "channel",
    action: "turn_on",
    payload: {
      entityId: "light.desk",
      brightness: 100,
      area_id: "all",
      entity_id: "all",
    },
  })
  const request = fetchRequest.mock.calls[0]
  expect(request?.[0]).toBe(
    "https://service.example/api/services/light/turn_on",
  )
  expect(JSON.parse(String(request?.[1]?.body))).toEqual({
    entity_id: "light.desk",
    brightness: 100,
  })
  expect(request?.[1]?.redirect).toBe("error")
  adapter.dispose()
})
test("camera data uses CastKit media paths and media requests check channel membership", async () => {
  const fetchRequest = vi
    .fn<typeof fetch>()
    .mockImplementation(
      async () =>
        new Response(
          JSON.stringify([
            {
              entity_id: "camera.printer",
              state: "idle",
              attributes: {
                friendly_name: "Printer",
                access_token: "private-token",
              },
            },
          ]),
        ),
    )
  const context = sourceContext({
    fetch: fetchRequest,
    channels: [
      {
        id: "cameras",
        name: "Cameras",
        sourceId: "source",
        type: "cameras.v1",
        settings: { entityIds: ["camera.printer"] },
      },
    ],
  })
  const adapter = createHomeAssistantSource(context)
  await adapter.start?.()
  expect(context.publish).toHaveBeenCalledWith({
    channelId: "cameras",
    data: {
      cameras: [
        {
          id: "camera.printer",
          name: "Printer",
          url: "/api/platform/channels/cameras/media/camera.printer?kind=camera",
          isLive: false,
        },
      ],
    },
  })
  await expect(
    adapter.getMedia?.({
      channelId: "cameras",
      assetId: "camera.other",
      kind: "camera",
    }),
  ).rejects.toThrow("does not include")
  adapter.dispose()
})

test("script actions send only channel-approved variables", async () => {
  const fetchRequest = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => new Response("[]"))
  const context = sourceContext({
    fetch: fetchRequest,
    channels: [
      {
        id: "timers",
        name: "Timers",
        sourceId: "source",
        type: "entities.v1",
        settings: {
          entityIds: ["script.create_timer"],
          scriptFieldsJson: JSON.stringify({
            "script.create_timer": ["name", "duration"],
          }),
        },
      },
    ],
  })
  const adapter = createHomeAssistantSource(context)
  await adapter.executeAction?.({
    channelId: "timers",
    action: "turn_on",
    payload: {
      entityId: "script.create_timer",
      variables: {
        name: "Tea",
        duration: "00:03:00",
        unapproved: "omit",
      },
    },
  })
  expect(
    JSON.parse(
      String(fetchRequest.mock.calls[0]?.[1]?.body),
    ),
  ).toEqual({
    entity_id: "script.create_timer",
    variables: { name: "Tea", duration: "00:03:00" },
  })
  adapter.dispose()
})
