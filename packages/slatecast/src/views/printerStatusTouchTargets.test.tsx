import { describe, expect, test } from "vitest"
import { page } from "vitest/browser"
import {
  buildDeviceProfile,
  buildPrinterJob,
  buildSnapshot,
} from "../__fixtures__/buildSnapshot.ts"
import { mountSlatecast } from "../__tests__/setup/mountSlatecast.tsx"
// This file measures boxes, so it needs the real rules.
import "../styles.css"

/**
 * The printer controls are sized for a fingertip on a wall panel.
 *
 * The remote-display renderer binds a touch by the control's bounding box
 * (see `nowPlayingTouchTargets.test.tsx` for the whole story), so the box is
 * what is measured here. Pause and Stop scale within 48–56 px and a 320 px
 * row; viewport growth gives space to the camera and facts. Clear plate keeps
 * its existing `max(56px, 13.4vmin)` sizing for the settled-job reminder.
 */

const PANELS = [
  [
    "the 1280x720 workbench panel",
    { width: 1280, height: 720 },
  ],
  ["the 720x720 square", { width: 720, height: 720 }],
  ["the 480x480 porthole", { width: 480, height: 480 }],
  ["the 480x320 short panel", { width: 480, height: 320 }],
  [
    "the 720x1280 portrait panel",
    { width: 720, height: 1280 },
  ],
  ["the 2560x1440 browser", { width: 2560, height: 1440 }],
] as const

const TARGET_ATTRIBUTE = "data-castkit-target"

const mountOnPanel = async ({
  width,
  height,
  printers,
}: {
  width: number
  height: number
  printers: ReturnType<typeof buildPrinterJob>[]
}) => {
  await page.viewport(width, height)
  await mountSlatecast({
    snapshot: buildSnapshot({
      view: "printer-status",
      device: buildDeviceProfile({
        width,
        height,
        hasTouch: true,
        views: [
          {
            name: "Printer Status",
            clientId: "printer-status",
          },
        ],
      }),
      data: { printers: { printers } },
    }),
  })
  await document.fonts.ready
}

const heightOf = (identity: string) =>
  document
    .querySelector(`[${TARGET_ATTRIBUTE}="${identity}"]`)
    ?.getBoundingClientRect().height ?? 0

describe.each(
  PANELS,
)("Printer Status touch targets on %s", (_label, panel) => {
  const vmin = Math.min(panel.width, panel.height) / 100
  const expectedActionHeight = Math.min(
    56,
    Math.max(48, 8.9 * vmin),
  )
  const expectedClearHeight = Math.max(56, 13.4 * vmin)

  test("Pause and Stop are a fingertip tall", async () => {
    await mountOnPanel({
      ...panel,
      printers: [buildPrinterJob()],
    })

    expect(heightOf("printer-pause:magi")).toBeCloseTo(
      expectedActionHeight,
      0,
    )
    expect(heightOf("printer-stop:magi")).toBeCloseTo(
      expectedActionHeight,
      0,
    )
  })

  test("Clear plate is taller still", async () => {
    await mountOnPanel({
      ...panel,
      printers: [
        buildPrinterJob({
          state: "finished",
          percent: 100,
        }),
      ],
    })

    expect(
      heightOf("printer-clear-plate:magi"),
    ).toBeCloseTo(expectedClearHeight, 0)
  })
})

test("the workbench panel's Pause and Stop stay capped, side by side", async () => {
  await mountOnPanel({
    width: 1280,
    height: 720,
    printers: [
      buildPrinterJob(),
      buildPrinterJob({ id: "foopie", name: "Foopie" }),
      buildPrinterJob({ id: "quad", name: "Quadrahedron" }),
    ],
  })

  const pause = document
    .querySelector(
      `[${TARGET_ATTRIBUTE}="printer-pause:foopie"]`,
    )
    ?.getBoundingClientRect()
  const stop = document
    .querySelector(
      `[${TARGET_ATTRIBUTE}="printer-stop:foopie"]`,
    )
    ?.getBoundingClientRect()

  expect(pause?.height).toBe(56)
  expect(stop?.height).toBe(56)
  expect(
    (pause?.width ?? 0) + (stop?.width ?? 0),
  ).toBeLessThanOrEqual(310)
  // Split evenly inside the bounded action row.
  expect(pause?.top).toBe(stop?.top)
  expect(pause?.width).toBeCloseTo(stop?.width ?? 0, 0)
})
