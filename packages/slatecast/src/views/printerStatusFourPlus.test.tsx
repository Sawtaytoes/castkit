import type { PrinterJob } from "@castkit/shared/viewData/types"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, test } from "vitest"
import { page } from "vitest/browser"
import {
  buildDeviceProfile,
  buildPrinterJob,
  buildSettings,
  buildSnapshot,
} from "../__fixtures__/buildSnapshot.ts"
import { mountSlatecast } from "../__tests__/setup/mountSlatecast.tsx"
import { __setPrinterPendingForStories } from "./PrinterStatus.tsx"
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
 *
 * The four test windows are here too, because a phone opens this view as
 * readily as the wall panel does.
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
  [
    "the 384x824 narrow window",
    { width: 384, height: 824 },
  ],
  [
    "the 1080x1920 tall window",
    { width: 1080, height: 1920 },
  ],
  [
    "the 3440x1440 ultrawide window",
    { width: 3440, height: 1440 },
  ],
  /*
   * Both sides of every cutoff: the 760 px and 1100 px row widths, the
   * height a 2×2 grid needs, the width that puts its picture beside the
   * facts, and the sizes an earlier review found clipped.
   */
  ["the 759x700 window", { width: 759, height: 700 }],
  ["the 761x700 window", { width: 761, height: 700 }],
  ["the 601x470 window", { width: 601, height: 470 }],
  ["the 650x620 window", { width: 650, height: 620 }],
  ["the 650x890 window", { width: 650, height: 890 }],
  ["the 1099x700 window", { width: 1099, height: 700 }],
  ["the 1101x700 window", { width: 1101, height: 700 }],
  ["the 1183x720 window", { width: 1183, height: 720 }],
  ["the 1184x720 window", { width: 1184, height: 720 }],
  ["the 1200x596 window", { width: 1200, height: 596 }],
  ["the 1200x659 window", { width: 1200, height: 659 }],
  ["the 1200x660 window", { width: 1200, height: 660 }],
  /*
   * A stacked grid's pictures: 700x660 once drew them 0 px tall. The
   * stacked grid starts at a 872 px window. 640x900 once switched between
   * the grid and rows on every frame.
   */
  ["the 700x660 window", { width: 700, height: 660 }],
  ["the 720x871 window", { width: 720, height: 871 }],
  ["the 720x872 window", { width: 720, height: 872 }],
  ["the 640x900 window", { width: 640, height: 900 }],
  ["the 320x824 phone", { width: 320, height: 824 }],
] as const

/**
 * The longest labels a row's buttons carry: Printer 2 is paused and resuming,
 * Printer 7 is printing and stopping.
 */
const PENDING = {
  "printer-2": "resume",
  "printer-7": "stop",
} as const

afterEach(() => {
  __setPrinterPendingForStories({})
})

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
      thumbnailPath: "/plate.png",
      // The widest layer count a long print reaches.
      currentLayer: 888,
      totalLayers: 999,
    }
    if (index === 0) {
      // The longest facts a row carries: a tall print's layers, two days and
      // more left, and two filaments.
      return buildPrinterJob({
        ...shared,
        currentLayer: 2236,
        totalLayers: 3360,
        percent: 99,
        finishAtMs: Date.now() + (50 * 60 + 50) * 60_000,
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
        // A tall print that failed late: the widest stopped layer.
        state: "failed",
        currentLayer: 2236,
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
  repaint = "instant",
  shape = "square",
  orientation = 0,
}: {
  width: number
  height: number
  printers: PrinterJob[]
  repaint?: "instant" | "slow"
  shape?: "square" | "round"
  orientation?: 0 | 90
}) => {
  __setPrinterPendingForStories(PENDING)
  await page.viewport(width, height)
  const mounted = await mountSlatecast({
    snapshot: buildSnapshot({
      view: "printer-status",
      device: buildDeviceProfile({
        width,
        height,
        hasTouch: true,
        repaint,
        shape,
        views: [
          {
            name: "Printer Status",
            clientId: "printer-status",
          },
        ],
      }),
      settings: buildSettings({ orientation }),
      data: { printers: { printers } },
    }),
  })
  await document.fonts.ready
  return mounted
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

/** The box of an element's words, not of the element: a label is a block. */
const textBox = (element: Element) => {
  const range = document.createRange()
  range.selectNodeContents(element)
  return range.getBoundingClientRect()
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
    /*
     * A fact's value is short, and a clipped one reads as a different number:
     * `173 / 4…` is not `173 / 499`. The values never ellipsize.
     */
    const clippedValues = drawnWithin(
      card,
      ".printer-metric:not(.is-filament) dd span, .printer-band-remaining, .printer-band-ended span, .printer-percent",
    )
      .filter(
        (value) =>
          value.scrollWidth > value.clientWidth + 1,
      )
      .map(
        (value) =>
          `${label}: "${value.textContent}" is clipped in ${value.className || value.tagName}`,
      )
    // The band clips what it cannot hold, so measure the percentage's text.
    const percentProblems = drawnWithin(
      card,
      ".printer-percent",
    )
      .filter((percent) => {
        const band = percent.closest(".printer-band")
        return (
          band !== null &&
          !isInside(
            textBox(percent),
            band.getBoundingClientRect(),
          )
        )
      })
      .map(
        (percent) =>
          `${label}: "${percent.textContent}" is cut by its band`,
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
          .filter(
            (other) =>
              !section.contains(other) &&
              !other.contains(section) &&
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
    const filamentLabel = filamentBox?.querySelector("dt")
    const filamentProblems =
      filamentBox &&
      filamentCount &&
      isDrawn(filamentBox) &&
      isDrawn(filamentCount)
        ? [
            ...(filamentLabel &&
            isDrawn(filamentLabel) &&
            isOverlapping(
              filamentCount.getBoundingClientRect(),
              textBox(filamentLabel),
            )
              ? [
                  `${label}: the filament count covers its label`,
                ]
              : []),
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
    /*
     * The filament's own words: inside the tile, and clear of its label. Each
     * line's box, not its text: a line that ends in an ellipsis draws only
     * what its box holds, and a wrapped line's box holds all of it.
     */
    const filamentLines =
      filamentBox && isDrawn(filamentBox)
        ? drawnWithin(
            filamentBox,
            ".printer-filament-text > span",
          )
        : []
    const filamentTextProblems = filamentLines.flatMap(
      (line) => [
        ...(filamentBox &&
        isInside(
          line.getBoundingClientRect(),
          filamentBox.getBoundingClientRect(),
        )
          ? []
          : [
              `${label}: the filament line "${line.textContent}" leaves its box`,
            ]),
        ...(filamentLabel &&
        isDrawn(filamentLabel) &&
        isOverlapping(
          line.getBoundingClientRect(),
          textBox(filamentLabel),
        )
          ? [
              `${label}: the filament line "${line.textContent}" covers its label`,
            ]
          : []),
      ],
    )
    /*
     * The job line is the tap that opens the whole job name and fault, so it
     * must have room and be the thing under a finger at its center.
     */
    const job =
      card.querySelector<HTMLElement>(".printer-job")
    const jobBox = job?.getBoundingClientRect()
    const elementAtJob = jobBox
      ? document.elementFromPoint(
          (jobBox.left + jobBox.right) / 2,
          (jobBox.top + jobBox.bottom) / 2,
        )
      : null
    const jobProblems =
      job && isDrawn(card)
        ? [
            ...(job.offsetWidth >= 32
              ? []
              : [`${label}: the job has no room`]),
            ...(elementAtJob && job.contains(elementAtJob)
              ? []
              : [`${label}: the job cannot be tapped`]),
          ]
        : []
    const plate = card.querySelector(".printer-plate")
    const plateProblems =
      plate &&
      getComputedStyle(plate).display !== "none" &&
      plate.getBoundingClientRect().height < 48
        ? [`${label}: the picture has no room`]
        : []
    const stateLabel = card.querySelector<HTMLElement>(
      ".printer-state-label",
    )
    const stateProblems =
      stateLabel &&
      isDrawn(
        card.querySelector(".printer-state") ?? card,
      ) &&
      stateLabel.offsetWidth < 24
        ? [`${label}: the state has no room for its word`]
        : []
    // Layout widths, not screen boxes: a turned panel swaps the two.
    const name =
      card.querySelector<HTMLElement>(".printer-name")
    const nameProblems =
      name && name.offsetWidth >= 40
        ? []
        : [`${label}: the printer's name has no room`]
    return [
      ...outside,
      ...overflowing,
      ...touching,
      ...filamentProblems,
      ...filamentTextProblems,
      ...plateProblems,
      ...stateProblems,
      ...jobProblems,
      ...clippedValues,
      ...percentProblems,
      ...nameProblems,
    ]
  })
  const strip = document.querySelector(".printer-overflow")
  const stripBox = strip?.getBoundingClientRect()
  const stripProblems = stripBox
    ? Array.from(
        document.querySelectorAll(
          ".printer-overflow-count, .printer-overflow-item",
        ),
      )
        .filter(isDrawn)
        .map((chip) => chip.getBoundingClientRect())
        .filter(
          (chipBox) =>
            chipBox.top < stripBox.bottom &&
            !isInside(chipBox, stripBox),
        )
        .map(
          () => "a strip chip is cut by the strip's edge",
        )
    : []
  // A chip the strip shows carries its whole name and state.
  const chipProblems = stripBox
    ? Array.from(
        document.querySelectorAll(".printer-overflow-item"),
      )
        .filter(isDrawn)
        .filter((chip) =>
          isOverlapping(
            chip.getBoundingClientRect(),
            stripBox,
          ),
        )
        .flatMap((chip) => {
          const chipBox = chip.getBoundingClientRect()
          const name = chip.querySelector<HTMLElement>(
            ".printer-overflow-name",
          )
          const state = chip.querySelector(
            ".printer-overflow-state",
          )
          return [
            ...(name && name.offsetWidth < 16
              ? [
                  `the strip chip for ${name.textContent} has no room for its name`,
                ]
              : []),
            ...(state && !isInside(textBox(state), chipBox)
              ? [
                  `the strip chip's "${state.textContent}" leaves the chip`,
                ]
              : []),
            ...(state &&
            state.scrollWidth > state.clientWidth + 1
              ? [
                  `the strip chip's "${state.textContent}" is cut short`,
                ]
              : []),
          ]
        })
    : []
  const roundStage = document.querySelector(
    ".stage.shape-round",
  )
  const roundProblems = roundStage
    ? (() => {
        const stageBox = roundStage.getBoundingClientRect()
        const centerX = (stageBox.left + stageBox.right) / 2
        const centerY = (stageBox.top + stageBox.bottom) / 2
        const radius =
          Math.min(stageBox.width, stageBox.height) / 2 +
          0.5
        return Array.from(
          document.querySelectorAll(
            ".printer-action, .printer-clear, .printer-name, .printer-band, .printer-overflow",
          ),
        )
          .filter(isDrawn)
          .filter((part) => {
            const box = part.getBoundingClientRect()
            return [
              [box.left, box.top],
              [box.right, box.top],
              [box.left, box.bottom],
              [box.right, box.bottom],
            ].some(
              ([cornerX = 0, cornerY = 0]) =>
                Math.hypot(
                  cornerX - centerX,
                  cornerY - centerY,
                ) > radius,
            )
          })
          .map(
            (part) =>
              `${part.className} reaches past the round glass`,
          )
      })()
    : []
  return [
    ...offGlass,
    ...blockOverlaps,
    ...cardProblems,
    ...stripProblems,
    ...chipProblems,
    ...roundProblems,
  ]
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
          ? "+1 more printer ›"
          : `+${hiddenNames.length} more printers ›`,
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
      "+1 more printer ›10Printer 10Preparing",
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

/** A job name and a fault both longer than any card can show in full. */
const LONG_JOB_NAME =
  "Very_Long_Multi_Plate_Assembly_With_Many_Parts_-_Plate_3_of_7_-_Matte_PETG_HF_-_0.4_mm_-_Printer_1"
const LONG_FAULT =
  "HMS_0700_2000_0002_0001 — The filament in AMS 1 slot 3 ran out. Load a new spool, then resume the print from the printer or from this panel."

describe("the full job name and fault are a tap away", () => {
  const WORKBENCH = { width: 1280, height: 720 }

  test.each([
    4, 9,
  ])("%i printers: a faulted card keeps its name and controls on the card", async (count) => {
    await mountOnPanel({
      ...WORKBENCH,
      printers: [
        buildPrinterJob({
          id: "printer-1",
          name: "Printer 1",
          jobName: LONG_JOB_NAME,
          state: "paused",
          problemText: LONG_FAULT,
        }),
        ...buildPrinters(count).slice(1),
      ],
    })

    expect(findLayoutProblems()).toEqual([])
  })

  test.each([
    4, 9,
  ])("%i printers: tapping a faulted job lists the whole name and fault", async (count) => {
    await mountOnPanel({
      ...WORKBENCH,
      printers: [
        buildPrinterJob({
          id: "printer-1",
          name: "Printer 1",
          jobName: LONG_JOB_NAME,
          state: "paused",
          problemText: LONG_FAULT,
        }),
        ...buildPrinters(count).slice(1),
      ],
    })

    const jobButton =
      document.querySelector<HTMLButtonElement>(
        ".printer-card .printer-job",
      )
    if (!jobButton) {
      throw new Error("The first card has no job button.")
    }
    await userEvent.click(jobButton)

    // The list rises into place, so wait for it to finish arriving.
    await expect
      .element(page.getByRole("dialog"))
      .toBeVisible()
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).toHaveTextContent(LONG_FAULT)
    expect(dialog).toHaveTextContent(
      "Very Long Multi Plate Assembly With Many Parts",
    )
    expect(
      document
        .querySelector(".printer-card")
        ?.getAttribute("data-expanded"),
    ).toBe("false")
  })
})

describe.each([
  [
    "the 1280x720 workbench panel",
    { width: 1280, height: 720 },
  ],
  ["the 480x320 short panel", { width: 480, height: 320 }],
  [
    "the 384x824 narrow window",
    { width: 384, height: 824 },
  ],
] as const)("the +N more strip on %s", (_label, panel) => {
  test("a tap lists every hidden printer, past the chips that fit", async () => {
    const printers = buildPrinters(20)
    await mountOnPanel({ ...panel, printers })

    const strip = document.querySelector<HTMLButtonElement>(
      ".printer-overflow",
    )
    if (!strip) {
      throw new Error("Twenty printers drew no strip.")
    }
    const drawnCount = drawnPrinterNames().length
    await userEvent.click(strip)
    await expect
      .element(page.getByRole("dialog"))
      .toBeVisible()

    const listedNames = Array.from(
      document.querySelectorAll(
        '[role="dialog"] .filament-details-name',
      ),
    ).map((name) => name.textContent?.split(" · ")[0])

    expect(listedNames).toEqual(
      printers
        .slice(drawnCount)
        .map((printer) => printer.name),
    )
    expect(
      document.querySelector('[role="dialog"]'),
    ).toHaveTextContent("Failed")
  })
})

describe("the layout follows live updates", () => {
  const WORKBENCH = { width: 1280, height: 720 }

  test.each([
    4, 9,
  ])("a job name opened with three printers closes when %i arrive", async (count) => {
    const { server } = await mountOnPanel({
      ...WORKBENCH,
      printers: buildPrinters(3),
    })
    const jobButton =
      document.querySelector<HTMLButtonElement>(
        ".printer-card .printer-job",
      )
    if (!jobButton) {
      throw new Error("The first card has no job button.")
    }
    await userEvent.click(jobButton)
    expect(
      document
        .querySelector(".printer-card")
        ?.getAttribute("data-expanded"),
    ).toBe("true")

    server.push({
      type: "printers",
      data: { printers: buildPrinters(count) },
    })

    await expect
      .poll(() => drawnPrinterNames().length)
      .toBe(count)
    expect(
      document.querySelectorAll(
        '.printer-card[data-expanded="true"]',
      ),
    ).toHaveLength(0)
    expect(findLayoutProblems()).toEqual([])
  })

  test("the hidden-printer list follows the strip, and closes when it empties", async () => {
    const { server } = await mountOnPanel({
      ...WORKBENCH,
      printers: buildPrinters(12),
    })
    const strip = document.querySelector<HTMLButtonElement>(
      ".printer-overflow",
    )
    if (!strip) {
      throw new Error("Twelve printers drew no strip.")
    }
    await userEvent.click(strip)
    await expect
      .element(page.getByRole("dialog"))
      .toBeVisible()

    server.push({
      type: "printers",
      data: { printers: buildPrinters(10) },
    })

    await expect
      .poll(() =>
        Array.from(
          document.querySelectorAll(
            '[role="dialog"] .filament-details-name',
          ),
        ).map((name) => name.textContent?.split(" · ")[0]),
      )
      .toEqual(["Printer 10"])
    expect(
      document.querySelector("#printer-details-title"),
    ).toHaveTextContent("+1 more printer")

    server.push({
      type: "printers",
      data: { printers: buildPrinters(9) },
    })

    await expect
      .poll(() => document.querySelector('[role="dialog"]'))
      .toBeNull()
  })
})

describe("the details dialog and the keyboard", () => {
  const WORKBENCH = { width: 1280, height: 720 }

  test("Enter opens it on Close, Tab stays inside, and Escape returns to the job", async () => {
    await mountOnPanel({
      ...WORKBENCH,
      printers: buildPrinters(9),
    })
    const jobButton =
      document.querySelector<HTMLButtonElement>(
        ".printer-card .printer-job",
      )
    if (!jobButton) {
      throw new Error("The first card has no job button.")
    }
    jobButton.focus()
    await userEvent.keyboard("{Enter}")
    await expect
      .element(page.getByRole("dialog"))
      .toBeVisible()

    const closeButton = document.querySelector(
      '[role="dialog"] .filament-details-close',
    )
    expect(document.activeElement).toBe(closeButton)

    await userEvent.tab()
    expect(document.activeElement).toBe(closeButton)
    await userEvent.tab({ shift: true })
    expect(document.activeElement).toBe(closeButton)

    await userEvent.keyboard("{Escape}")
    await expect
      .poll(() => document.querySelector('[role="dialog"]'))
      .toBeNull()
    expect(document.activeElement).toBe(jobButton)
  })
})

describe("the details dialog's motion", () => {
  const WORKBENCH = { width: 1280, height: 720 }

  const openFirstJob = async () => {
    const jobButton =
      document.querySelector<HTMLButtonElement>(
        ".printer-card .printer-job",
      )
    if (!jobButton) {
      throw new Error("The first card has no job button.")
    }
    await userEvent.click(jobButton)
    await expect
      .element(page.getByRole("dialog"))
      .toBeVisible()
  }

  const closeButton = () => {
    const button =
      document.querySelector<HTMLButtonElement>(
        '[role="dialog"] .filament-details-close',
      )
    if (!button) {
      throw new Error("The dialog has no Close button.")
    }
    return button
  }

  const dialogBoxAnimation = () => {
    const box = document.querySelector('[role="dialog"]')
    return box ? getComputedStyle(box).animationName : null
  }

  test("an instant panel rises it in and sinks it out before it goes", async () => {
    await mountOnPanel({
      ...WORKBENCH,
      printers: buildPrinters(9),
    })
    await openFirstJob()

    expect(dialogBoxAnimation()).toBe(
      "printer-details-enter",
    )

    await userEvent.click(closeButton())

    expect(
      document
        .querySelector(".printer-details-dialog")
        ?.getAttribute("data-closing"),
    ).toBe("true")
    expect(dialogBoxAnimation()).toBe(
      "printer-details-exit",
    )
    await expect
      .poll(() => document.querySelector('[role="dialog"]'))
      .toBeNull()
  })

  test("a slow panel shows and removes it without motion", async () => {
    await mountOnPanel({
      ...WORKBENCH,
      printers: buildPrinters(9),
      repaint: "slow",
    })
    await openFirstJob()

    expect(dialogBoxAnimation()).toBe("none")

    await userEvent.click(closeButton())

    expect(
      document.querySelector('[role="dialog"]'),
    ).toBeNull()
  })
})

describe.each([
  ["the 320x320 round panel", 320, 320, "round", 0],
  ["the 448x448 round panel", 448, 448, "round", 0],
  ["the 449x449 round panel", 449, 449, "round", 0],
  ["the 384x384 round panel", 384, 384, "round", 0],
  ["the 421x421 round panel", 421, 421, "round", 0],
  ["the 480x480 round porthole", 480, 480, "round", 0],
  ["the 720x720 round panel", 720, 720, "round", 0],
  ["a 1280x320 window turned 90°", 1280, 320, "square", 90],
  ["a 720x1280 window turned 90°", 720, 1280, "square", 90],
] as const)("Printer Status from four printers on %s", (_label, width, height, shape, orientation) => {
  test.each(
    COUNTS,
  )("%i printers: every control is on the glass", async (count) => {
    await mountOnPanel({
      width,
      height,
      shape,
      orientation,
      printers: buildPrinters(count),
    })

    expect(findLayoutProblems()).toEqual([])
    const drawnCount = drawnPrinterNames().length
    const hiddenCount = document.querySelectorAll(
      ".printer-overflow-name",
    ).length
    expect(drawnCount + hiddenCount).toBe(count)
  })
})

describe("the arrangement settles", () => {
  test.each([
    [640, 900],
    [650, 890],
    [700, 660],
  ])("four printers at %ix%i keep one arrangement", async (width, height) => {
    await mountOnPanel({
      width,
      height,
      printers: buildPrinters(4),
    })
    const view = document.querySelector(".printer-status")
    if (!view) {
      throw new Error("Printer Status did not mount.")
    }
    const layouts: (string | null)[] = []
    const observer = new MutationObserver(() => {
      layouts.push(view.getAttribute("data-layout"))
    })
    observer.observe(view, {
      attributes: true,
      attributeFilter: ["data-layout"],
    })
    await new Promise((resolve) => {
      window.setTimeout(resolve, 400)
    })
    observer.disconnect()

    expect(layouts).toEqual([])
  })
})

describe("two dialogs never stack", () => {
  const WORKBENCH = { width: 1280, height: 720 }

  test("Tab stays in the filament list, and Escape closes only it", async () => {
    await mountOnPanel({
      ...WORKBENCH,
      printers: buildPrinters(12),
    })
    const filamentButton =
      document.querySelector<HTMLButtonElement>(
        ".printer-card .printer-filament-button",
      )
    if (!filamentButton) {
      throw new Error(
        "The first card has no filament button.",
      )
    }
    filamentButton.focus()
    await userEvent.keyboard("{Enter}")
    await expect
      .element(page.getByRole("dialog"))
      .toBeVisible()

    const filamentDialog = document.querySelector(
      "#printer-filament-details",
    )
    await userEvent.tab({ shift: true })
    expect(
      filamentDialog?.contains(document.activeElement),
    ).toBe(true)
    await userEvent.tab()
    expect(
      filamentDialog?.contains(document.activeElement),
    ).toBe(true)

    await userEvent.keyboard("{Escape}")
    await expect
      .poll(() => document.querySelector('[role="dialog"]'))
      .toBeNull()
    expect(document.activeElement).toBe(filamentButton)
  })

  test("a Stop question holds the keyboard and starts on Keep printing", async () => {
    await mountOnPanel({
      ...WORKBENCH,
      printers: buildPrinters(9),
    })
    const stopButton =
      document.querySelector<HTMLButtonElement>(
        ".printer-card .printer-action.is-stop",
      )
    if (!stopButton) {
      throw new Error("The first card has no Stop button.")
    }
    await userEvent.click(stopButton)
    await expect
      .element(page.getByRole("dialog"))
      .toBeVisible()

    expect(document.activeElement).toHaveTextContent(
      "Keep printing",
    )
    await userEvent.tab()
    await userEvent.tab()
    expect(document.activeElement).toHaveTextContent(
      "Keep printing",
    )

    await userEvent.keyboard("{Escape}")
    await expect
      .poll(() => document.querySelector('[role="dialog"]'))
      .toBeNull()
  })
})

describe("an empty feed forgets the open dialog", () => {
  test("the hidden-printer list does not come back by itself", async () => {
    const { server } = await mountOnPanel({
      width: 1280,
      height: 720,
      printers: buildPrinters(12),
    })
    const strip = document.querySelector<HTMLButtonElement>(
      ".printer-overflow",
    )
    if (!strip) {
      throw new Error("Twelve printers drew no strip.")
    }
    await userEvent.click(strip)
    await expect
      .element(page.getByRole("dialog"))
      .toBeVisible()

    server.push({
      type: "printers",
      data: { printers: [] },
    })
    await expect
      .poll(() => document.querySelector(".printer-empty"))
      .not.toBeNull()
    server.push({
      type: "printers",
      data: { printers: buildPrinters(12) },
    })
    await expect
      .poll(() => drawnPrinterNames().length)
      .toBe(9)

    expect(
      document.querySelector('[role="dialog"]'),
    ).toBeNull()
  })
})

describe("the details dialog on a phone", () => {
  test("a long unbroken printer name wraps inside the dialog", async () => {
    const longName = "PrinterLongUnbrokenName".repeat(7)
    await mountOnPanel({
      width: 320,
      height: 824,
      printers: [
        buildPrinterJob({
          id: "printer-1",
          name: longName,
          jobName: "Fixture_Job_-_PLA_-_Printer 1",
        }),
        ...buildPrinters(4).slice(1),
      ],
    })
    const jobButton =
      document.querySelector<HTMLButtonElement>(
        ".printer-card .printer-job",
      )
    if (!jobButton) {
      throw new Error("The first card has no job button.")
    }
    await userEvent.click(jobButton)
    await expect
      .element(page.getByRole("dialog"))
      .toBeVisible()

    const dialog = document.querySelector<HTMLElement>(
      '[role="dialog"]',
    )
    expect(dialog?.scrollWidth).toBeLessThanOrEqual(
      (dialog?.clientWidth ?? 0) + 1,
    )
    expect(dialog).toHaveTextContent(
      "Fixture_Job_-_PLA_-_Printer 1",
    )
  })
})

/** The list rises into place; measure it where it comes to rest. */
const settleDialogMotion = async () => {
  const box = document.querySelector('[role="dialog"]')
  await Promise.all(
    (box?.getAnimations() ?? []).map(
      (animation) => animation.finished,
    ),
  )
}

/** Every hidden printer with a fault long enough to wrap. */
const buildFaultedPrinters = (count: number) =>
  buildPrinters(count).map((printer) => ({
    ...printer,
    state: "paused" as const,
    problemText: LONG_FAULT,
  }))

describe("the hidden-printer list on a turned or round panel", () => {
  test("on a 320x1280 window turned 90°, the last entry scrolls onto the glass", async () => {
    await mountOnPanel({
      width: 320,
      height: 1280,
      orientation: 90,
      printers: buildFaultedPrinters(12),
    })
    const strip = document.querySelector<HTMLButtonElement>(
      ".printer-overflow",
    )
    if (!strip) {
      throw new Error("Twelve printers drew no strip.")
    }
    await userEvent.click(strip)
    await expect
      .element(page.getByRole("dialog"))
      .toBeVisible()

    await settleDialogMotion()
    const box = document.querySelector<HTMLElement>(
      '[role="dialog"]',
    )
    if (!box) {
      throw new Error("The list did not open.")
    }
    box.scrollTop = box.scrollHeight
    const glass = {
      left: 0,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
    }
    const entries = box.querySelectorAll(
      ".printer-details-item",
    )
    const lastEntry = entries[entries.length - 1]

    expect(
      isInside(box.getBoundingClientRect(), glass),
    ).toBe(true)
    expect(
      lastEntry &&
        isInside(lastEntry.getBoundingClientRect(), glass),
    ).toBe(true)
  })

  test.each([
    320, 480,
  ])("on a %i px round panel, the list keeps inside the circle", async (size) => {
    await mountOnPanel({
      width: size,
      height: size,
      shape: "round",
      printers: buildPrinters(12),
    })
    const strip = document.querySelector<HTMLButtonElement>(
      ".printer-overflow",
    )
    if (!strip) {
      throw new Error("Twelve printers drew no strip.")
    }
    await userEvent.click(strip)
    await expect
      .element(page.getByRole("dialog"))
      .toBeVisible()
    await settleDialogMotion()

    const box = document
      .querySelector('[role="dialog"]')
      ?.getBoundingClientRect()
    const radius = size / 2 + 0.5
    const corners = box
      ? [
          [box.left, box.top],
          [box.right, box.top],
          [box.left, box.bottom],
          [box.right, box.bottom],
        ]
      : []

    expect(corners).toHaveLength(4)
    expect(
      corners.filter(
        ([cornerX = 0, cornerY = 0]) =>
          Math.hypot(
            cornerX - size / 2,
            cornerY - size / 2,
          ) > radius,
      ),
    ).toEqual([])
  })
})

describe("a question about a printer that left", () => {
  test("does not come back when the printer does", async () => {
    const { server } = await mountOnPanel({
      width: 1280,
      height: 720,
      printers: buildPrinters(9),
    })
    const stopButton =
      document.querySelector<HTMLButtonElement>(
        ".printer-card .printer-action.is-stop",
      )
    if (!stopButton) {
      throw new Error("The first card has no Stop button.")
    }
    await userEvent.click(stopButton)
    await expect
      .element(page.getByRole("dialog"))
      .toBeVisible()

    server.push({
      type: "printers",
      data: { printers: buildPrinters(9).slice(1) },
    })
    await expect
      .poll(() => drawnPrinterNames().length)
      .toBe(8)
    server.push({
      type: "printers",
      data: { printers: buildPrinters(9) },
    })
    await expect
      .poll(() => drawnPrinterNames().length)
      .toBe(9)

    expect(
      document.querySelector('[role="dialog"]'),
    ).toBeNull()
  })
})

describe("the tiny-row cutoff", () => {
  test.each([
    448, 449,
  ])("a %i px round panel draws four printers that fit", async (size) => {
    await mountOnPanel({
      width: size,
      height: size,
      shape: "round",
      printers: buildPrinters(4),
    })

    expect(drawnPrinterNames()).toHaveLength(4)
    expect(
      document.querySelector(".printer-overflow"),
    ).toBeNull()
  })
})

describe("a Stop question on a small round panel", () => {
  test("keeps its answers inside the circle and under a finger", async () => {
    await mountOnPanel({
      width: 320,
      height: 320,
      shape: "round",
      printers: buildPrinters(12),
    })
    const stopButton =
      document.querySelector<HTMLButtonElement>(
        ".printer-card .printer-action.is-stop",
      )
    if (!stopButton) {
      throw new Error("The first card has no Stop button.")
    }
    await userEvent.click(stopButton)
    await expect
      .element(page.getByRole("dialog"))
      .toBeVisible()

    const answers = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".printer-confirm-actions button",
      ),
    )
    const box = document
      .querySelector(".printer-confirm-box")
      ?.getBoundingClientRect()
    const isInCircle = (pointX: number, pointY: number) =>
      Math.hypot(pointX - 160, pointY - 160) <= 160.5

    expect(answers).toHaveLength(2)
    expect(
      box &&
        [
          [box.left, box.top],
          [box.right, box.top],
          [box.left, box.bottom],
          [box.right, box.bottom],
        ].every(([cornerX = 0, cornerY = 0]) =>
          isInCircle(cornerX, cornerY),
        ),
    ).toBe(true)
    expect(
      answers.flatMap((answer) => {
        const answerBox = answer.getBoundingClientRect()
        // 8 px in from the corners: inside the buttons' 12 px rounding.
        return [
          [answerBox.left + 8, answerBox.top + 8],
          [answerBox.right - 8, answerBox.bottom - 8],
        ]
          .filter(
            ([pointX = 0, pointY = 0]) =>
              !isInCircle(pointX, pointY) ||
              !answer.contains(
                document.elementFromPoint(pointX, pointY),
              ),
          )
          .map(() => answer.textContent)
      }),
    ).toEqual([])
  })
})

describe("the hidden-printer list's Close", () => {
  test("stays in view after the list scrolls to its end", async () => {
    await mountOnPanel({
      width: 320,
      height: 320,
      shape: "round",
      printers: buildFaultedPrinters(6),
    })
    const strip = document.querySelector<HTMLButtonElement>(
      ".printer-overflow",
    )
    if (!strip) {
      throw new Error("Six printers drew no strip.")
    }
    await userEvent.click(strip)
    await expect
      .element(page.getByRole("dialog"))
      .toBeVisible()
    await settleDialogMotion()

    const box = document.querySelector<HTMLElement>(
      '[role="dialog"]',
    )
    if (!box) {
      throw new Error("The list did not open.")
    }
    box.scrollTop = box.scrollHeight
    await userEvent.tab()
    const closeButton = box.querySelector(
      ".filament-details-close",
    )

    expect(box.scrollTop).toBeGreaterThan(0)
    expect(document.activeElement).toBe(closeButton)
    expect(
      closeButton &&
        isInside(
          closeButton.getBoundingClientRect(),
          box.getBoundingClientRect(),
        ),
    ).toBe(true)
  })

  test("a failed printer's details keep the layer it stopped at", async () => {
    await mountOnPanel({
      width: 1280,
      height: 720,
      printers: [
        buildPrinterJob({
          id: "printer-1",
          name: "Printer 1",
          state: "failed",
          currentLayer: 2236,
          percent: 99,
        }),
        ...buildPrinters(9).slice(1),
      ],
    })
    const jobButton =
      document.querySelector<HTMLButtonElement>(
        ".printer-card .printer-job",
      )
    if (!jobButton) {
      throw new Error("The first card has no job button.")
    }
    await userEvent.click(jobButton)
    await expect
      .element(page.getByRole("dialog"))
      .toBeVisible()

    expect(
      document.querySelector('[role="dialog"]'),
    ).toHaveTextContent("stopped at layer 2236")
  })
})

describe("the stopped layer in a five-printer row", () => {
  test.each([
    0, 90,
  ] as const)("a failed printer near its end keeps its whole layer on a 1280x720 window turned %i°", async (orientation) => {
    await mountOnPanel({
      width: 1280,
      height: 720,
      orientation,
      printers: [
        buildPrinterJob({
          id: "printer-1",
          name: "Printer 1",
          jobName: "Sample_Part_1_-_PLA_Basic_-_Printer_1",
          thumbnailPath: "/plate.png",
          state: "failed",
          currentLayer: 2236,
          totalLayers: 3360,
          percent: 99,
          finishAtMs: Date.now() - 300_000,
        }),
        ...buildPrinters(5).slice(1),
      ],
    })

    expect(
      document
        .querySelector(".printer-status")
        ?.getAttribute("data-layout"),
    ).toBe("list")
    expect(
      document.querySelector(
        ".printer-card .printer-band-ended",
      ),
    ).toHaveTextContent("2236")
    expect(findLayoutProblems()).toEqual([])
  })
})

describe("the details dialog on a small round panel", () => {
  test("every entry can scroll fully into view", async () => {
    await mountOnPanel({
      width: 320,
      height: 320,
      shape: "round",
      printers: [
        buildPrinterJob({
          id: "printer-1",
          name: "PrinterLongUnbrokenName".repeat(3),
          jobName: LONG_JOB_NAME,
          state: "paused",
          problemText: LONG_FAULT,
        }),
        ...buildPrinters(4).slice(1),
      ],
    })
    const jobButton =
      document.querySelector<HTMLButtonElement>(
        ".printer-card .printer-job",
      )
    if (!jobButton) {
      throw new Error("The first card has no job button.")
    }
    await userEvent.click(jobButton)
    await expect
      .element(page.getByRole("dialog"))
      .toBeVisible()
    await settleDialogMotion()

    const box = document.querySelector<HTMLElement>(
      '[role="dialog"]',
    )
    if (!box) {
      throw new Error("The details did not open.")
    }
    const entries = Array.from(
      box.querySelectorAll(
        ".filament-details-head, .printer-details-item > *",
      ),
    )
    expect(entries.length).toBeGreaterThan(1)
    for (const entry of entries) {
      entry.scrollIntoView({ block: "start" })
      const entryBox = entry.getBoundingClientRect()
      const boxRect = box.getBoundingClientRect()
      // An entry taller than the box shows its top; a shorter one shows whole.
      expect(entryBox.top).toBeGreaterThanOrEqual(
        boxRect.top - 1,
      )
      if (entryBox.height <= box.clientHeight) {
        expect(entryBox.bottom).toBeLessThanOrEqual(
          boxRect.bottom + 1,
        )
      }
      // Nothing else in the box, such as a header pinned above, covers it.
      const hit = document.elementFromPoint(
        (entryBox.left + entryBox.right) / 2,
        entryBox.top + 4,
      )
      expect(hit && entry.contains(hit)).toBe(true)
    }
  })
})

/**
 * A print that failed late last night on its last layer: the longest pair of
 * ended lines beside the widest percentage.
 */
const buildLateFailure = () =>
  buildPrinterJob({
    id: "printer-1",
    name: "Printer 1",
    jobName: "Sample_Part_1_-_PLA_Basic_-_Printer_1",
    thumbnailPath: "/plate.png",
    state: "failed",
    currentLayer: 99999,
    totalLayers: 99999,
    percent: 100,
    finishAtMs: new Date().setHours(0, 0, 0, 0) - 60_000,
  })

/**
 * Where the first row's ended lines are cut, if anywhere. The stopped line
 * must sit whole inside the band. The ended time may give way, but only
 * whole: it is either inside the band or wrapped out of the summary's box.
 */
const findEndedOverflow = () => {
  const band = document.querySelector(
    ".printer-card .printer-band",
  )
  const ended = document.querySelector(
    ".printer-card .printer-band-ended",
  )
  if (!band || !ended || !isDrawn(ended)) {
    return null
  }
  const bandBox = band.getBoundingClientRect()
  const endedBox = ended.getBoundingClientRect()
  const size = `${bandBox.width.toFixed(1)}x${bandBox.height.toFixed(1)} band`
  // The text itself, not its box: a word wider than its box overflows it.
  const isTextShown = (line: Element) => {
    const lineText = textBox(line)
    return (
      isInside(lineText, bandBox) &&
      isInside(lineText, endedBox)
    )
  }
  const [stopped, endedTime] = Array.from(
    ended.querySelectorAll("span"),
  )
  if (!stopped || !isTextShown(stopped)) {
    return `the stopped line is cut in a ${size}`
  }
  const percent = band.querySelector(".printer-percent")
  if (
    percent &&
    isOverlapping(textBox(percent), textBox(stopped))
  ) {
    return `the stopped line runs into the percentage in a ${size}`
  }
  if (!endedTime || !isDrawn(endedTime)) {
    return null
  }
  const isWrappedAway = !isOverlapping(
    textBox(endedTime),
    endedBox,
  )
  return isTextShown(endedTime) || isWrappedAway
    ? null
    : `the ended time is cut in a ${size}`
}

/** Whether a line of the band's text shows whole inside its band. */
const isShownInBand = (line: Element) => {
  const band = line.closest(".printer-band")
  return (
    band !== null &&
    isDrawn(line) &&
    isInside(
      line.getBoundingClientRect(),
      band.getBoundingClientRect(),
    )
  )
}

const nextFrame = () =>
  new Promise((resolve) =>
    requestAnimationFrame(() =>
      requestAnimationFrame(resolve),
    ),
  )

describe("the ended lines in a short band", () => {
  test.each([
    {
      count: 10,
      across: 660,
      orientation: 0,
      turn: "upright",
    },
    {
      count: 6,
      across: 520,
      orientation: 0,
      turn: "upright",
    },
    {
      count: 7,
      across: 720,
      orientation: 0,
      turn: "upright",
    },
    {
      count: 10,
      across: 660,
      orientation: 90,
      turn: "turned 90°",
    },
  ] as const)("$count printers, $across px across, $turn, fit every band in a sweep of window sizes", async ({
    count,
    across,
    orientation,
  }) => {
    const sizeFor = (along: number) =>
      orientation === 0
        ? { width: along, height: across }
        : { width: across, height: along }
    await mountOnPanel({
      ...sizeFor(1150),
      orientation,
      printers: [
        buildLateFailure(),
        ...buildPrinters(count).slice(1),
      ],
    })
    const problems: string[] = []
    let bandsSeen = 0
    for (let along = 1150; along <= 1300; along += 1) {
      const { width, height } = sizeFor(along)
      await page.viewport(width, height)
      await nextFrame()
      const bandWidth =
        document
          .querySelector(".printer-card .printer-band")
          ?.getBoundingClientRect() ?? null
      const span = Math.max(
        bandWidth?.width ?? 0,
        bandWidth?.height ?? 0,
      )
      if (span >= 176 && span <= 204) {
        bandsSeen += 1
      }
      const overflow = findEndedOverflow()
      if (overflow) {
        problems.push(`${width}x${height}: ${overflow}`)
      }
    }

    expect(bandsSeen).toBeGreaterThan(5)
    expect(problems).toEqual([])
    // A sweep of a hundred window sizes outlasts the default under load.
  }, 90_000)

  test("a round panel with ten printers fits its ended lines at every size", async () => {
    await mountOnPanel({
      width: 1100,
      height: 1100,
      shape: "round",
      printers: [
        buildLateFailure(),
        ...buildPrinters(10).slice(1),
      ],
    })
    const problems: string[] = []
    for (let size = 1100; size <= 1230; size += 1) {
      await page.viewport(size, size)
      await nextFrame()
      const overflow = findEndedOverflow()
      if (overflow) {
        problems.push(`${size}: ${overflow}`)
      }
    }

    expect(problems).toEqual([])
    expect(findLayoutProblems()).toEqual([])
  }, 90_000)

  test("a finished print's short row on a 1280x720 panel keeps the ended time", async () => {
    await mountOnPanel({
      width: 1280,
      height: 720,
      printers: buildPrinters(7),
    })
    const finished = document.querySelector(
      '.printer-card[data-state="finished"]',
    )
    const endedTime = finished?.querySelector(
      ".printer-band-ended span + span",
    )

    expect(
      finished?.getBoundingClientRect().height,
    ).toBeLessThan(98)
    expect(endedTime).toHaveTextContent(/^Ended /)
    expect(endedTime && isShownInBand(endedTime)).toBe(true)
    expect(findLayoutProblems()).toEqual([])
  })

  test("a 1280x720 panel with five printers keeps the ended time", async () => {
    await mountOnPanel({
      width: 1280,
      height: 720,
      printers: [
        buildLateFailure(),
        ...buildPrinters(5).slice(1),
      ],
    })

    const endedTime = document.querySelector(
      ".printer-card .printer-band-ended span + span",
    )
    expect(endedTime).toHaveTextContent(/^Ended /)
    expect(endedTime && isShownInBand(endedTime)).toBe(true)
    expect(findEndedOverflow()).toBeNull()
    expect(findLayoutProblems()).toEqual([])
  })
})

describe("the ended lines in a fallback font", () => {
  test.each([
    { count: 5, height: 900 },
    { count: 10, height: 660 },
  ] as const)("$count printers, $height px tall, fit every band without the Outfit font", async ({
    count,
    height,
  }) => {
    // As though Outfit failed to load: the stack's next, wider fonts.
    const fallback = document.createElement("style")
    fallback.textContent = `.printer-status, .printer-status * {
        font-family: "Noto Sans JP", ui-sans-serif, system-ui, Arial, sans-serif !important;
      }`
    document.head.append(fallback)
    try {
      await mountOnPanel({
        width: 761,
        height,
        printers: [
          buildLateFailure(),
          ...buildPrinters(count).slice(1),
        ],
      })
      const problems: string[] = []
      for (let width = 761; width <= 1300; width += 3) {
        await page.viewport(width, height)
        await nextFrame()
        const overflow = findEndedOverflow()
        if (overflow) {
          problems.push(`${width}x${height}: ${overflow}`)
        }
      }

      expect(problems).toEqual([])
    } finally {
      fallback.remove()
    }
  }, 90_000)
})

describe("a fractional percentage", () => {
  test.each([
    { width: 480, height: 660, shape: "square" },
    { width: 320, height: 824, shape: "square" },
    { width: 761, height: 900, shape: "square" },
    { width: 1280, height: 720, shape: "square" },
    { width: 480, height: 480, shape: "round" },
  ] as const)("shows whole and rounded down on a $width x $height $shape panel", async ({
    width,
    height,
    shape,
  }) => {
    await mountOnPanel({
      width,
      height,
      shape,
      printers: [
        buildPrinterJob({
          id: "printer-1",
          name: "Printer 1",
          jobName: "Sample_Part_1_-_PLA_Basic_-_Printer_1",
          thumbnailPath: "/plate.png",
          percent: 99.99,
        }),
        ...buildPrinters(5).slice(1),
      ],
    })

    expect(
      document.querySelector(
        ".printer-card .printer-percent",
      ),
    ).toHaveTextContent(/^99%$/)
    expect(findLayoutProblems()).toEqual([])
  })
})

const LONG_FILAMENT =
  "Glass Fiber Reinforced High Temperature Polycarbonate"

describe("a long filament name", () => {
  test.each([
    { width: 652, height: 872, count: 4 },
    { width: 1280, height: 720, count: 4 },
    { width: 1280, height: 720, count: 7 },
    { width: 761, height: 900, count: 5 },
    { width: 2560, height: 1440, count: 4 },
  ] as const)("stays in its tile on a $width x $height panel with $count printers", async ({
    width,
    height,
    count,
  }) => {
    const [first, ...rest] = buildPrinters(count)
    await mountOnPanel({
      width,
      height,
      printers: [
        {
          ...first,
          filamentText: `${LONG_FILAMENT} · AMS 1, slot 1`,
          filaments: [
            {
              name: LONG_FILAMENT,
              color: "#1c1c1c",
              location: "AMS 1, slot 1",
            },
            {
              name: "Support for PLA",
              color: "#f1e7d0",
              location: "AMS 2, slot 4",
            },
          ],
        },
        ...rest,
      ],
    })

    expect(findLayoutProblems()).toEqual([])
  })
})

describe("the strip on a small round panel", () => {
  test("twelve preparing printers leave no chip squeezed", async () => {
    await mountOnPanel({
      width: 320,
      height: 320,
      shape: "round",
      printers: buildPrinters(12).map((printer) => ({
        ...printer,
        state: "preparing" as const,
        percent: 0,
      })),
    })

    expect(
      document.querySelector(".printer-overflow-count"),
    ).toHaveTextContent(/more/)
    expect(findLayoutProblems()).toEqual([])
  })
})

describe("a summary-only filament feed", () => {
  test("the filament list gives the whole name the grid cuts short", async () => {
    const summary = `${LONG_FILAMENT} · AMS 1, slot 1`
    const [first, ...rest] = buildPrinters(4)
    await mountOnPanel({
      width: 652,
      height: 872,
      printers: [
        {
          ...first,
          filamentText: summary,
          filaments: undefined,
        },
        ...rest,
      ],
    })
    const tile = document.querySelector<HTMLButtonElement>(
      ".printer-card .printer-filament-button",
    )
    if (!tile) {
      throw new Error(
        "The first card has no filament tile.",
      )
    }
    await userEvent.click(tile)
    await expect
      .element(page.getByRole("dialog"))
      .toBeVisible()

    expect(
      document.querySelector('[role="dialog"]'),
    ).toHaveTextContent(summary)
  })

  test("a long unbroken tray name wraps inside the filament list", async () => {
    const [first, ...rest] = buildPrinters(4)
    await mountOnPanel({
      width: 1280,
      height: 720,
      printers: [
        {
          ...first,
          filaments: [
            {
              name: "PLA Matte",
              color: "#1c1c1c",
              location: "TRAY".repeat(25),
            },
          ],
        },
        ...rest,
      ],
    })
    const tile = document.querySelector<HTMLButtonElement>(
      ".printer-card .printer-filament-button",
    )
    if (!tile) {
      throw new Error(
        "The first card has no filament tile.",
      )
    }
    await userEvent.click(tile)
    await expect
      .element(page.getByRole("dialog"))
      .toBeVisible()
    const box = document.querySelector<HTMLElement>(
      '[role="dialog"]',
    )

    expect(box?.scrollWidth).toBeLessThanOrEqual(
      (box?.clientWidth ?? 0) + 1,
    )
  })
})

describe("long printer names in the strip", () => {
  test("a hidden failed printer's chip still says Failed", async () => {
    await mountOnPanel({
      width: 353,
      height: 350,
      // Every printer the panel hides has failed, so the first chip is one.
      printers: buildPrinters(12).map((printer, index) => ({
        ...printer,
        name: `Wide North Workshop Carbon Fiber Printer ${index + 1}`,
        ...(index >= 3
          ? {
              state: "failed" as const,
              finishAtMs: Date.now() - 300_000,
            }
          : {}),
      })),
    })
    const strip = document.querySelector(
      ".printer-overflow",
    )
    const firstChip = document.querySelector(
      ".printer-overflow-item",
    )
    const state = firstChip?.querySelector<HTMLElement>(
      ".printer-overflow-state",
    )
    if (!strip || !firstChip || !state) {
      throw new Error("The strip drew no chip.")
    }

    expect(state).toHaveTextContent("Failed")
    expect(
      isInside(
        firstChip.getBoundingClientRect(),
        strip.getBoundingClientRect(),
      ),
    ).toBe(true)
    expect(state.scrollWidth).toBeLessThanOrEqual(
      state.clientWidth + 1,
    )
    expect(findLayoutProblems()).toEqual([])
  })
})

describe("a slot list without the active material's name", () => {
  test("the filament list still gives the whole summary", async () => {
    const summary = `${LONG_FILAMENT} · AMS 1, slot 1`
    const [first, ...rest] = buildPrinters(4)
    await mountOnPanel({
      width: 652,
      height: 872,
      printers: [
        {
          ...first,
          filamentText: summary,
          filaments: [
            { color: "#1c2c6c", location: "AMS 1, slot 1" },
          ],
        },
        ...rest,
      ],
    })
    const tile = document.querySelector<HTMLButtonElement>(
      ".printer-card .printer-filament-button",
    )
    if (!tile) {
      throw new Error(
        "The first card has no filament tile.",
      )
    }
    await userEvent.click(tile)
    await expect
      .element(page.getByRole("dialog"))
      .toBeVisible()

    expect(
      document.querySelector('[role="dialog"]'),
    ).toHaveTextContent(summary)
  })
})
