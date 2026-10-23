import { MONOCHROME_PALETTE } from "@castkit/core/panels/palette"
import type { ViewDefinition } from "@castkit/sdk/contracts"
import { Hono } from "hono"
import { afterEach, expect, test } from "vitest"
import {
  createPlatform,
  type Platform,
} from "./platform.ts"
import { readPlatformFrameKey } from "./platformFrameKey.ts"
import { attachPlatformRoutes } from "./platformRoutes.ts"

/*
 * Two displays that share a platform frame key share ONE capture, taken
 * through the first display's `?device=` URL. That is safe only if the page
 * the capture loads is the same for both. The server half of that page is the
 * display snapshot, so this checks it byte for byte.
 */
const runtimes = new Set<Platform>()
afterEach(() => {
  runtimes.forEach((platform) => {
    platform.dispose()
  })
  runtimes.clear()
})

const watch = ({ id }: { id: string }) => ({
  id,
  label: `Watch ${id}`,
  mac: `02:00:00:00:00:0${id.length}`,
  width: 200,
  height: 200,
  colorMode: "monochrome" as const,
  palette: MONOCHROME_PALETTE,
  rotation: 0 as const,
  ditherProfile: {
    algorithm: "off" as const,
    supersampleFactor: 1,
  },
  repaint: "fast" as const,
  power: "battery" as const,
  renderOn: "request" as const,
})

const totalsView: ViewDefinition = {
  id: "totals",
  name: "Totals",
  layout: "single",
  panels: [
    {
      id: "points",
      specId: "kids-points",
      bindings: { data: "kids-points/house" },
      settings: { isTotalsOnly: true },
    },
  ],
  theme: "light",
  access: "public",
  isControlEnabled: false,
}

const createFixture = async (
  devices: ReturnType<typeof watch>[],
) => {
  const platform = await createPlatform({
    publisher: {
      isEnabled: false,
      publish: async () => {},
      subscribe: async () => {},
      close: async () => {},
    },
    devices: devices as never,
  })
  runtimes.add(platform)
  platform.store.update((previous) => ({
    ...previous,
    views: [totalsView],
    screens: [
      {
        id: "watches",
        name: "Watches",
        defaultViewId: "totals",
        viewIds: ["totals"],
        access: "public",
      },
    ],
    deviceScreens: Object.fromEntries(
      devices.map((device) => [device.id, "watches"]),
    ),
  }))
  const app = new Hono()
  attachPlatformRoutes({ app, platform })
  const readCaptureSnapshot = async (deviceId: string) =>
    (
      await app.request(
        `/api/display/screen/watches?device=${deviceId}&capture=1`,
        {
          headers: {
            "x-castkit-render-key": platform.renderKey,
          },
        },
      )
    ).text()
  const readKey = (deviceId: string) =>
    readPlatformFrameKey({
      platform,
      deviceId,
      now: Date.now(),
    })
  return { readCaptureSnapshot, readKey }
}

test("two identical watches on one screen get one key and the same capture page", async () => {
  const { readCaptureSnapshot, readKey } =
    await createFixture([
      watch({ id: "watch-one" }),
      watch({ id: "watch-two" }),
    ])

  expect(readKey("watch-one")).toBeDefined()
  expect(readKey("watch-one")).toBe(readKey("watch-two"))

  const first = await readCaptureSnapshot("watch-one")
  const second = await readCaptureSnapshot("watch-two")
  expect(first).toContain('"displayProperties"')
  expect(second).toBe(first)
  // Nothing in what the page draws names the display.
  expect(first).not.toContain("watch-one")
})
