import { describe, expect, test, vi } from "vitest"
import type { ConfiguredDevice } from "../config/env.ts"
import { createDeviceConfigStore } from "../state/deviceConfigStore.ts"
import { createViewDataStore } from "../state/viewDataStore.ts"
import {
  createPhotoFrameAdapter,
  getPhotoTargetWidth,
  getShouldRefetchOnRecompose,
} from "./photoFrameAdapter.ts"

const DEVICE_ID = "living-room"

const buildDevice = (): ConfiguredDevice =>
  ({
    id: DEVICE_ID,
    width: 800,
    height: 480,
  }) as unknown as ConfiguredDevice

const buildAdapter = () => {
  const deviceConfigStore = createDeviceConfigStore()
  const viewDataStore = createViewDataStore()
  const pushDevice = vi.fn().mockResolvedValue(true)
  const adapter = createPhotoFrameAdapter({
    immichConfig: {
      url: "http://immich.test",
      apiKey: "key",
    },
    getIntervalMinutes: () => 30,
    getRecencyHalfLifeDays: () => 30,
    getPeopleMinimum: () => 1,
    devices: [buildDevice()],
    deviceConfigStore,
    viewDataStore,
    getActiveView: () => "Photo Frame",
    pushDevice,
  })
  return {
    adapter,
    deviceConfigStore,
    viewDataStore,
    pushDevice,
  }
}

describe("photoFrameAdapter.showPhotoFrame", () => {
  test("shows an already-cached photo immediately without refetching", async () => {
    const { adapter, viewDataStore, pushDevice } =
      buildAdapter()
    viewDataStore.setPhotoFrame({
      deviceId: DEVICE_ID,
      data: {
        photoDataUri: "data:image/png;base64,AAAA",
        assetId: "asset-1",
        fetchedAtMs: 1_000,
      },
    })

    await adapter.showPhotoFrame({ deviceId: DEVICE_ID })

    // Exactly one push, and the cached photo is left untouched (no fetch).
    expect(pushDevice).toHaveBeenCalledTimes(1)
    expect(pushDevice).toHaveBeenCalledWith(DEVICE_ID)
    expect(
      viewDataStore.getPhotoFrame(DEVICE_ID)?.assetId,
    ).toBe("asset-1")
  })

  test("renders the placeholder once when nothing is configured", async () => {
    const { adapter, viewDataStore, pushDevice } =
      buildAdapter()

    await adapter.showPhotoFrame({ deviceId: DEVICE_ID })

    // No people/query and no cached photo: a single push renders the
    // placeholder, and no photo data was fetched or stored.
    expect(pushDevice).toHaveBeenCalledTimes(1)
    expect(
      viewDataStore.getPhotoFrame(DEVICE_ID),
    ).toBeUndefined()
  })
})

describe("photoFrameAdapter.recomposeCurrentPhoto", () => {
  test("falls back to a fresh photo when there is no history yet", async () => {
    const { adapter, viewDataStore } = buildAdapter()

    // No people and no query configured, so the fallback fetch finds nothing
    // and stores nothing. What matters is that it did not throw, and did not
    // silently leave a stale cached frame behind.
    await adapter.recomposeCurrentPhoto(DEVICE_ID)

    expect(
      viewDataStore.getPhotoFrame(DEVICE_ID),
    ).toBeUndefined()
  })

  test("is a no-op for a device this adapter does not own", async () => {
    const { adapter, pushDevice } = buildAdapter()

    await expect(
      adapter.recomposeCurrentPhoto("not-a-device"),
    ).resolves.toBeUndefined()
    expect(pushDevice).not.toHaveBeenCalled()
  })
})

describe("getShouldRefetchOnRecompose", () => {
  test("a Duo frame always refetches, even with history to replay", () => {
    // The history holds single assets, not the pair a Duo frame needs. Replaying
    // it would collapse two columns into one while the owner tunes a crop.
    expect(
      getShouldRefetchOnRecompose({
        activeView: "Photo Frame (Duo)",
        historyLength: 5,
      }),
    ).toBe(true)
  })

  test("a single-photo frame replays its history", () => {
    expect(
      getShouldRefetchOnRecompose({
        activeView: "Photo Frame",
        historyLength: 5,
      }),
    ).toBe(false)
  })

  test("an empty history has nothing to replay", () => {
    expect(
      getShouldRefetchOnRecompose({
        activeView: "Photo Frame",
        historyLength: 0,
      }),
    ).toBe(true)
  })
})

describe("getPhotoTargetWidth", () => {
  test("the photo-agenda image is composed for its final half-width column", () => {
    expect(
      getPhotoTargetWidth({
        viewName: "Photo Frame (Agenda)",
        contentWidth: 678,
      }),
    ).toBe(339)
  })

  test("a full-photo view keeps the whole visible width", () => {
    expect(
      getPhotoTargetWidth({
        viewName: "Photo Frame (Fill)",
        contentWidth: 678,
      }),
    ).toBe(678)
  })
})
