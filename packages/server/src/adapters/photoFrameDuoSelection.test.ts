import sharp from "sharp"
import { afterEach, expect, test, vi } from "vitest"
import type { ConfiguredDevice } from "../config/env.ts"
import { createDeviceConfigStore } from "../state/deviceConfigStore.ts"
import { createViewDataStore } from "../state/viewDataStore.ts"
import { createPhotoFrameAdapter } from "./photoFrameAdapter.ts"

const source = vi.hoisted(() => ({
  pickRandomAssetId: vi.fn(),
  pickRandomAssetIds: vi.fn(),
  fetchPreviewJpeg: vi.fn(),
  fetchFaceBoxes: vi.fn(),
  resolvePersonIds: vi.fn(),
}))
vi.mock("../immich/immichClient.ts", () => source)
afterEach(() => vi.resetAllMocks())

const build = async (
  primary: "wide" | "portrait",
  rotation = 0,
) => {
  const images = {
    wide: await sharp({
      create: {
        width: 800,
        height: 480,
        channels: 3,
        background: "#00ff00",
      },
    })
      .png()
      .toBuffer(),
    portrait: await sharp({
      create: {
        width: 400,
        height: 600,
        channels: 3,
        background: "#ff0000",
      },
    })
      .png()
      .toBuffer(),
    companion: await sharp({
      create: {
        width: 400,
        height: 600,
        channels: 3,
        background: "#0000ff",
      },
    })
      .png()
      .toBuffer(),
  }
  source.pickRandomAssetId.mockResolvedValue(primary)
  source.pickRandomAssetIds.mockResolvedValue([
    primary,
    "companion",
  ])
  source.fetchPreviewJpeg.mockImplementation(
    async ({ assetId }: { assetId: keyof typeof images }) =>
      images[assetId],
  )
  source.fetchFaceBoxes.mockResolvedValue([])
  const deviceId = "sample-photo-display"
  const deviceConfigStore = createDeviceConfigStore()
  deviceConfigStore.setPhotoQuery({
    deviceId,
    queryText: "sample photos",
  })
  const viewDataStore = createViewDataStore()
  const pushDevice = vi.fn(async () => true)
  const adapter = createPhotoFrameAdapter({
    immichConfig: {
      url: "https://photos.test",
      apiKey: "fixture",
    },
    getIntervalMinutes: () => 30,
    getRecencyHalfLifeDays: () => 30,
    getPeopleMinimum: () => 1,
    devices: [
      {
        id: deviceId,
        width: 800,
        height: 480,
        rotation,
      } as ConfiguredDevice,
    ],
    deviceConfigStore,
    viewDataStore,
    getActiveView: () => "Photo Frame (Duo)",
    pushDevice,
  })
  return { adapter, deviceId, viewDataStore, pushDevice }
}

const readPixel = async (uri: string, left: number) => {
  const bytes = Buffer.from(
    uri.split(",")[1] ?? "",
    "base64",
  )
  return Array.from(
    await sharp(bytes)
      .extract({ left, top: 200, width: 1, height: 1 })
      .removeAlpha()
      .raw()
      .toBuffer(),
  )
}

test("Duo displays a selected landscape across the whole panel", async () => {
  const { adapter, deviceId, viewDataStore, pushDevice } =
    await build("wide")
  await adapter.refreshDevice(deviceId)
  const photo = viewDataStore.getPhotoFrame(deviceId)
  expect(photo?.assetId).toBe("wide")
  expect(
    await readPixel(photo?.photoDataUri ?? "", 100),
  ).toEqual([0, 255, 0])
  expect(
    await readPixel(photo?.photoDataUri ?? "", 700),
  ).toEqual([0, 255, 0])
  expect(source.pickRandomAssetIds).not.toHaveBeenCalled()
  expect(pushDevice).toHaveBeenCalledTimes(1)
})

test("Duo pairs the selected portrait with a different portrait", async () => {
  const { adapter, deviceId, viewDataStore } =
    await build("portrait")
  await adapter.refreshDevice(deviceId)
  const photo = viewDataStore.getPhotoFrame(deviceId)
  expect(photo?.assetId).toBe("portrait")
  expect(
    await readPixel(photo?.photoDataUri ?? "", 100),
  ).toEqual([255, 0, 0])
  expect(
    await readPixel(photo?.photoDataUri ?? "", 700),
  ).toEqual([0, 0, 255])
  expect(
    source.fetchPreviewJpeg.mock.calls.filter(
      ([request]) => request.assetId === "portrait",
    ),
  ).toHaveLength(1)
})

test("Duo keeps the selected portrait when no companion exists", async () => {
  const { adapter, deviceId, viewDataStore } =
    await build("portrait")
  source.pickRandomAssetIds.mockResolvedValue(["portrait"])
  await adapter.refreshDevice(deviceId)
  const photo = viewDataStore.getPhotoFrame(deviceId)
  expect(photo?.assetId).toBe("portrait")
  expect(
    await readPixel(photo?.photoDataUri ?? "", 700),
  ).toEqual([255, 0, 0])
})

test("a quarter-turned panel preserves the single-photo layout", async () => {
  const { adapter, deviceId } = await build("portrait", 90)
  await adapter.refreshDevice(deviceId)
  expect(source.pickRandomAssetIds).not.toHaveBeenCalled()
})

test("a failed companion lookup still shows the selected portrait", async () => {
  const { adapter, deviceId, viewDataStore } =
    await build("portrait")
  source.pickRandomAssetIds.mockRejectedValue(
    new Error("Photo service is unavailable"),
  )
  await adapter.refreshDevice(deviceId)
  expect(
    viewDataStore.getPhotoFrame(deviceId)?.assetId,
  ).toBe("portrait")
})

test("landscape companions with incorrect metadata are skipped", async () => {
  const { adapter, deviceId, viewDataStore } =
    await build("portrait")
  source.pickRandomAssetIds.mockResolvedValue([
    "portrait",
    "wide",
  ])
  await adapter.refreshDevice(deviceId)
  const photo = viewDataStore.getPhotoFrame(deviceId)
  expect(
    await readPixel(photo?.photoDataUri ?? "", 700),
  ).toEqual([255, 0, 0])
})
