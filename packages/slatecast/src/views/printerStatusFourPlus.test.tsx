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
      ".printer-metric:not(.is-filament) dd span, .printer-band-remaining, .printer-percent",
    )
      .filter(
        (value) =>
          value.scrollWidth > value.clientWidth + 1,
      )
      .map(
        (value) =>
          `${label}: "${value.textContent}" is clipped in ${value.className || value.tagName}`,
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
      ...plateProblems,
      ...stateProblems,
      ...jobProblems,
      ...clippedValues,
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
