import { expect, test } from "vitest"
import { assertActionAllowed } from "./actionPolicy.ts"

test.each([
  { entityVisibilityJson: "{broken" },
  { entityVisibilityJson: "[]" },
  { actionVisibilityJson: "{broken" },
  { actionVisibility: { "switch.example": null } },
  { actionButtonsJson: "{}" },
])("malformed configured control policies fail closed: %j", (settings) => {
  expect(() =>
    assertActionAllowed({
      panel: {
        id: "controls",
        specId: "entities",
        bindings: { data: "room" },
        settings,
      },
      channels: {
        room: {
          id: "room",
          type: "entities.v1",
          status: "ready",
          data: {
            entities: [
              {
                id: "switch.example",
                state: "off",
                actions: ["turn_on"],
              },
            ],
          },
        },
      },
      channelId: "room",
      action: "turn_on",
      payload: { entityId: "switch.example" },
    }),
  ).toThrow(/invalid/)
})
