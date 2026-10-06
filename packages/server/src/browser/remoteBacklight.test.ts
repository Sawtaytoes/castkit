import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ChannelSnapshot } from "@castkit/sdk/contracts"
import { expect, test } from "vitest"
import { createPlatformStore } from "../platform/platformStore.ts"
import { createRemoteBacklight } from "./remoteBacklight.ts"

test("direct brightness and power survive process recreation without a source", () => {
  const directory = mkdtempSync(
    join(tmpdir(), "castkit-controls-"),
  )
  const file = join(directory, "platform.json")
  try {
    const controls = createRemoteBacklight({
      store: createPlatformStore({ file }),
      getChannel: () => undefined,
    })
    expect(
      controls.set({
        deviceId: "panel",
        kind: "backlightLevel",
        payload: "35",
      }),
    ).toBe(true)
    expect(
      controls.set({
        deviceId: "panel",
        kind: "backlightPower",
        payload: "off",
      }),
    ).toBe(true)
    const restored = createRemoteBacklight({
      store: createPlatformStore({ file }),
      getChannel: () => undefined,
    })
    expect(
      restored.resolve("panel").backlight_percent,
    ).toBe(0)
    restored.set({
      deviceId: "panel",
      kind: "backlightPower",
      payload: "on",
    })
    expect(
      restored.resolve("panel").backlight_percent,
    ).toBe(35)
    expect(
      restored.set({
        deviceId: "panel",
        kind: "backlightLevel",
        payload: "101",
      }),
    ).toBe(false)
    expect(
      restored.set({
        deviceId: "panel",
        kind: "backlightLevel",
        payload: "NaN",
      }),
    ).toBe(false)
    expect(
      restored.resolve("panel").backlight_percent,
    ).toBe(35)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("room following uses selected current state, holds on outages and allows manual override", () => {
  const state: { snapshot?: ChannelSnapshot } = {}
  const controls = createRemoteBacklight({
    store: createPlatformStore(),
    getChannel: () => state.snapshot,
  })
  Object.entries({
    backlightLevel: "35",
    backlightPower: "follow-room",
    backlightRoomChannel: "room/lights",
    backlightRoomEntity: "light.room",
  }).forEach(([kind, payload]) => {
    controls.set({ deviceId: "panel", kind, payload })
  })
  expect(controls.resolve("panel")).toEqual({
    backlight_percent: 0,
    room_status: "unavailable",
  })
  state.snapshot = {
    id: "room/lights",
    type: "entities.v1",
    status: "ready",
    data: {
      entities: [
        {
          id: "light.room",
          name: "Room",
          domain: "light",
          state: "on",
          attributes: {},
          actions: [],
        },
      ],
    },
  }
  expect(controls.resolve("panel")).toEqual({
    backlight_percent: 35,
    room_status: "on",
  })
  state.snapshot = { ...state.snapshot, status: "stale" }
  expect(controls.resolve("panel")).toEqual({
    backlight_percent: 35,
    room_status: "unavailable",
  })
  state.snapshot = {
    ...state.snapshot,
    status: "ready",
    data: {
      entities: [
        {
          id: "light.room",
          name: "Room",
          domain: "light",
          state: "off",
          attributes: {},
          actions: [],
        },
      ],
    },
  }
  expect(controls.resolve("panel").backlight_percent).toBe(
    0,
  )
  controls.set({
    deviceId: "panel",
    kind: "backlightPower",
    payload: "on",
  })
  expect(controls.resolve("panel").backlight_percent).toBe(
    35,
  )
})
