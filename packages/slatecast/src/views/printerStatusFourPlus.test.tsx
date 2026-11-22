import type { PrinterJob } from "@castkit/shared/viewData/types"
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
 * Printer Status with four printers and up: the 2×2 grid, the compact rows,
 * and the "+N more" strip. Every count is measured on every panel, because
 * the three defects the owner found in the first version were all boxes on
 * top of other boxes or past their edge:
 *
 * - from seven rows, the progress band sat on Pause and Stop;
 * - "2 filaments · Details ›" ran out of the first card's filament box;
 * - from ten printers, the tenth was dropped with nothing on the glass to
 *   say so.
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

const COUNTS = [4, 5, 6, 7, 8, 9, 10, 12] as const

/**
 * The first printer runs two filaments, the case whose count overflowed. The
 * rest cycle through every shape a card can take.
 */
const buildPrinters = (count: number): PrinterJob[] =>
  Array.from({ length: count }, (_, index) => {
    const printerNumber = index + 1
    const shared = {
      id: `printer-${printerNumber}`,
      name: `Printer ${printerNumber}`,
      jobName: `Sample_Part_${printerNumber}_-_PLA_Basic_-_Printer_${printerNumber}`,
    }
    if (index === 0) {
      return buildPrinterJob({
        ...shared,
        filaments: [
          {
            name: "PLA Matte",
            color: "#1c1c1c",
            location: "AMS 3, slot 3",
          },
          {
            name: "Support for PLA",
            color: "#f1e7d0",
            location: "AMS 1, slot 1",
          },
        ],
      })
    }
    const shapes: Partial<PrinterJob>[] = [
      {},
      { state: "paused" },
      {
        state: "finished",
        percent: 100,
        finishAtMs: Date.now() - 600_000,
      },
      {
        state: "preparing",
        percent: 0,
        filamentText: undefined,
        filamentColor: undefined,
      },
      {
        state: "paused",
        problemText:
          "HMS_0700_2000_0002_0001 — AMS 1 slot 3 ran out",
      },
      {
        state: "failed",
        finishAtMs: Date.now() - 300_000,
      },
    ]
    return buildPrinterJob({
      ...shared,
      ...shapes[index % shapes.length],
    })
  })

const mountOnPanel = async ({
  width,
  height,
  printers,
}: {
  width: number
  height: number
  printers: PrinterJob[]
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

type Box = Pick<
  DOMRect,
  "left" | "right" | "top" | "bottom"
>

/** Half a pixel of slack for subpixel layout. */
const isInside = (inner: Box, outer: Box) =>
  inner.left >= outer.left - 0.5 &&
  inner.right <= outer.right + 0.5 &&
  inner.top >= outer.top - 0.5 &&
  inner.bottom <= outer.bottom + 0.5

const isOverlapping = (first: Box, second: Box) =>
  first.left < second.right - 0.5 &&
  second.left < first.right - 0.5 &&
  first.top < second.bottom - 0.5 &&
  second.top < first.bottom - 0.5

const isDrawn = (element: Element) => {
  const box = element.getBoundingClientRect()
  return (
    box.width > 0 &&
    box.height > 0 &&
    getComputedStyle(element).display !== "none"
  )
}

const drawnWithin = (root: Element, selector: string) =>
  Array.from(root.querySelectorAll(selector)).filter(
    isDrawn,
  )

/** The card's own sections. None of them may touch another. */
const SECTION_SELECTOR = [
  ".printer-plate",
  ".printer-head",
  ".printer-job",
  ".printer-problem",
  ".printer-metrics",
  ".printer-band",
  ".printer-actions",
  ".printer-clear",
].join(", ")

/** Everything a person reads or touches. Each must sit inside its card. */
const PART_SELECTOR = [
  SECTION_SELECTOR,
  ".printer-metric",
  ".printer-action",
  ".printer-state",
  ".printer-percent",
  ".printer-filament-count",
].join(", ")

/** Boxes whose text must not run past their own edge. */
const TEXT_BOX_SELECTOR = [
  ".printer-metric",
  ".printer-filament-button",
  ".printer-band-text",
  ".printer-action",
  ".printer-clear",
].join(", ")

const findLayoutProblems = () => {
  const glass = {
    left: 0,
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
  }
  const blocks = Array.from(
    document.querySelectorAll(
      ".printer-card, .printer-overflow",
    ),
  )
  const offGlass = blocks
    .filter(
      (block) =>
        !isInside(block.getBoundingClientRect(), glass),
    )
    .map((block) => `${block.className} leaves the glass`)
  const blockOverlaps = blocks.flatMap((block, index) =>
    blocks
      .slice(index + 1)
      .filter((other) =>
        isOverlapping(
          block.getBoundingClientRect(),
          other.getBoundingClientRect(),
        ),
      )
      .map(() => `card ${index + 1} overlaps another`),
  )
  const cardProblems = Array.from(
    document.querySelectorAll(".printer-card"),
  ).flatMap((card, cardIndex) => {
    const label = `card ${cardIndex + 1}`
    const cardBox = card.getBoundingClientRect()
    const outside = drawnWithin(card, PART_SELECTOR)
      .filter(
        (part) =>
          !isInside(part.getBoundingClientRect(), cardBox),
      )
      .map(
        (part) => `${label}: ${part.className} is outside`,
      )
    const overflowing = drawnWithin(card, TEXT_BOX_SELECTOR)
      .filter(
        (box) =>
          box.scrollWidth > box.clientWidth + 1 ||
          box.scrollHeight > box.clientHeight + 1,
      )
      .map(
        (box) =>
          `${label}: ${box.className} overflows its box`,
      )
    const sections = drawnWithin(card, SECTION_SELECTOR)
    const touching = sections.flatMap(
      (section, sectionIndex) =>
        sections
          .slice(sectionIndex + 1)
          .filter((other) =>
            isOverlapping(
              section.getBoundingClientRect(),
              other.getBoundingClientRect(),
            ),
          )
          .map(
            (other) =>
              `${label}: ${section.className} overlaps ${other.className}`,
          ),
    )
    const filamentBox = card.querySelector(
      ".printer-metric.is-filament",
    )
    const filamentCount = card.querySelector(
      ".printer-filament-count",
    )
    const filamentSummary = card.querySelector(
      ".printer-filament-summary",
    )
    const filamentProblems =
      filamentBox &&
      filamentCount &&
      isDrawn(filamentBox) &&
      isDrawn(filamentCount)
        ? [
            ...(isInside(
              filamentCount.getBoundingClientRect(),
              filamentBox.getBoundingClientRect(),
            )
              ? []
              : [
                  `${label}: the filament count leaves its box`,
                ]),
            ...(filamentSummary &&
            isDrawn(filamentSummary) &&
            isOverlapping(
              filamentCount.getBoundingClientRect(),
              filamentSummary.getBoundingClientRect(),
            )
              ? [
                  `${label}: the filament count covers the name`,
                ]
              : []),
          ]
        : []
    return [
      ...outside,
      ...overflowing,
      ...touching,
      ...filamentProblems,
    ]
  })
  return [...offGlass, ...blockOverlaps, ...cardProblems]
}

const drawnPrinterNames = () =>
  Array.from(
    document.querySelectorAll(
      ".printer-card .printer-name",
    ),
  ).map((name) => name.textContent)

describe.each(
  PANELS,
)("Printer Status from four printers on %s", (_label, panel) => {
  test.each(
    COUNTS,
  )("%i printers: nothing overlaps and nothing leaves its box", async (count) => {
    await mountOnPanel({
      ...panel,
      printers: buildPrinters(count),
    })

    expect(findLayoutProblems()).toEqual([])
  })

  test.each(
    COUNTS,
  )("%i printers: every printer is drawn or named in the strip", async (count) => {
    await mountOnPanel({
      ...panel,
      printers: buildPrinters(count),
    })

    const drawnCount = drawnPrinterNames().length
    const strip = document.querySelector(
      ".printer-overflow",
    )
    const hiddenNames = Array.from(
      document.querySelectorAll(".printer-overflow-name"),
    ).map((name) => name.textContent)

    expect(drawnCount + hiddenNames.length).toBe(count)
    expect(hiddenNames).toEqual(
      buildPrinters(count)
        .slice(drawnCount)
        .map((printer) => printer.name),
    )
    if (hiddenNames.length === 0) {
      expect(strip).toBeNull()
    } else {
      expect(
        strip?.querySelector(".printer-overflow-count")
          ?.textContent,
      ).toBe(
        hiddenNames.length === 1
          ? "+1 more printer"
          : `+${hiddenNames.length} more printers`,
      )
    }
  })
})

describe("Printer Status on the 1280x720 workbench panel", () => {
  const WORKBENCH = { width: 1280, height: 720 }

  test("four printers make a 2×2 grid with the plate beside the facts", async () => {
    await mountOnPanel({
      ...WORKBENCH,
      printers: buildPrinters(4),
    })

    const firstCard =
      document.querySelector(".printer-card")
    const plate = firstCard
      ?.querySelector(".printer-plate")
      ?.getBoundingClientRect()
    const body = firstCard
      ?.querySelector(".printer-body")
      ?.getBoundingClientRect()

    expect(
      document
        .querySelector(".printer-status")
        ?.getAttribute("data-layout"),
    ).toBe("quad")
    expect(plate?.right).toBeLessThanOrEqual(
      body?.left ?? 0,
    )
  })

  test.each([
    5, 6, 7, 8, 9,
  ])("%i printers are all drawn, one row each", async (count) => {
    await mountOnPanel({
      ...WORKBENCH,
      printers: buildPrinters(count),
    })

    expect(
      document
        .querySelector(".printer-status")
        ?.getAttribute("data-layout"),
    ).toBe("list")
    expect(drawnPrinterNames()).toHaveLength(count)
    expect(
      document.querySelector(".printer-overflow"),
    ).toBeNull()
  })

  test("ten printers draw nine rows and name the tenth", async () => {
    await mountOnPanel({
      ...WORKBENCH,
      printers: buildPrinters(10),
    })

    const strip = document.querySelector(
      ".printer-overflow",
    )

    expect(drawnPrinterNames()).toHaveLength(9)
    expect(strip).toBeVisible()
    expect(strip).toHaveTextContent(
      "+1 more printer10Printer 10Preparing",
    )
  })

  test("Pause and Stop stay a fingertip tall in nine rows", async () => {
    await mountOnPanel({
      ...WORKBENCH,
      printers: buildPrinters(9),
    })

    const heights = Array.from(
      document.querySelectorAll(".printer-action"),
    ).map((button) => button.getBoundingClientRect().height)

    expect(heights.length).toBeGreaterThan(0)
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(48)
  })
})
