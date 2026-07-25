import { screen, waitFor } from "@testing-library/preact"
import {
  afterEach,
  describe,
  expect,
  test,
  vi,
} from "vitest"
import {
  buildDeviceProfile,
  buildSettings,
  buildSnapshot,
} from "../__fixtures__/buildSnapshot.ts"
import { mountSlatecast } from "../__tests__/setup/mountSlatecast.tsx"

const mountPhotoFrame = async ({
  deviceId = "dev-square",
  photoIntervalMinutes = 10,
}: {
  deviceId?: string
  photoIntervalMinutes?: number
} = {}) =>
  mountSlatecast({
    snapshot: buildSnapshot({
      view: "photo-frame",
      device: buildDeviceProfile({ id: deviceId }),
      settings: buildSettings({ photoIntervalMinutes }),
      data: {},
    }),
  })

const photo = () =>
  document.querySelector(
    ".photo-frame-img",
  ) as HTMLImageElement

describe("photo source", () => {
  test("points at this device's photo endpoint", async () => {
    await mountPhotoFrame({ deviceId: "kitchen-slate" })

    expect(photo().getAttribute("src")).toBe(
      "/d/kitchen-slate/photo?n=0",
    )
  })
})

describe("empty endpoint", () => {
  test("shows the placeholder once the image fails to load", async () => {
    await mountPhotoFrame()

    // A 204 from the photo endpoint (Immich off, or nothing configured)
    // reaches the client as an image error and nothing else.
    photo().dispatchEvent(new Event("error"))

    await waitFor(() => {
      expect(
        screen.getByText("No photos configured"),
      ).toBeVisible()
    })
    expect(photo().className).toBe("photo-frame-img hidden")
  })
})

describe("rotation", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test("fetches the next photo each time the interval elapses", async () => {
    // Only the interval is faked: the mount helper's socket handshake and
    // waitFor both need a real setTimeout.
    vi.useFakeTimers({
      toFake: ["setInterval", "clearInterval"],
    })
    await mountPhotoFrame({ photoIntervalMinutes: 1 })
    expect(photo().getAttribute("src")).toBe(
      "/d/dev-square/photo?n=0",
    )

    vi.advanceTimersByTime(60_000)

    await waitFor(() => {
      expect(photo().getAttribute("src")).toBe(
        "/d/dev-square/photo?n=1",
      )
    })

    vi.advanceTimersByTime(60_000)

    await waitFor(() => {
      expect(photo().getAttribute("src")).toBe(
        "/d/dev-square/photo?n=2",
      )
    })
  })

  test("holds the same photo until the interval elapses", async () => {
    vi.useFakeTimers({
      toFake: ["setInterval", "clearInterval"],
    })
    await mountPhotoFrame({ photoIntervalMinutes: 10 })

    vi.advanceTimersByTime(9 * 60_000)

    expect(photo().getAttribute("src")).toBe(
      "/d/dev-square/photo?n=0",
    )
  })
})
