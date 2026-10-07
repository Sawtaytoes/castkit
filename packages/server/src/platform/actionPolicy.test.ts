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

test("now-playing controls are restricted to the player shown by the channel", () => {
  const request = {
    panel: {
      id: "media",
      specId: "now-playing",
      bindings: { data: "room" },
      settings: {},
    },
    channels: {
      room: {
        id: "room",
        type: "now-playing.v1",
        status: "ready" as const,
        data: { entityId: "media_player.room" },
      },
    },
    channelId: "room",
    action: "media_pause",
    payload: { entityId: "media_player.room" },
  }
  expect(() => assertActionAllowed(request)).not.toThrow()
  expect(() =>
    assertActionAllowed({
      ...request,
      payload: { entityId: "media_player.other" },
    }),
  ).toThrow(/current player/)
  expect(() =>
    assertActionAllowed({ ...request, payload: {} }),
  ).toThrow(/current player/)
})

test("printer commands cannot target a printer excluded by this view", () => {
  const request = {
    panel: {
      id: "printers",
      specId: "printer-status",
      bindings: { data: "prints" },
      settings: {
        isPrinterSelectionEnabled: true,
        printerIds: ["one"],
      },
    },
    channels: {
      prints: {
        id: "prints",
        type: "printers.v1",
        status: "ready" as const,
        data: { printers: [{ id: "one" }, { id: "two" }] },
      },
    },
    channelId: "prints",
    action: "pause",
    payload: { printerId: "one" },
  }
  expect(() => assertActionAllowed(request)).not.toThrow()
  expect(() =>
    assertActionAllowed({
      ...request,
      payload: { printerId: "two" },
    }),
  ).toThrow(/not part/)
})
