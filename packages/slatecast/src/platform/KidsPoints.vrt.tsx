import type { ContractData } from "@castkit/sdk/contracts"
import { render } from "@testing-library/preact"
import {
  afterAll,
  afterEach,
  beforeAll,
  expect,
  inject,
  test,
  vi,
} from "vitest"
import { page } from "vitest/browser"
import { SCREENSHOT_EPOCH_MILLIS } from "../stories/freezeClockUnderAutomation.ts"
import { kidsPointsFixture } from "./fixtures.ts"
import { DisplayComposition } from "./PlatformApp.tsx"
import type { DisplaySnapshot } from "./protocol.ts"
import "../styles.css"
import "./platform.css"

/**
 * Visual-regression shots of Tally Marks at the sizes where it changes shape.
 *
 * The view picks a board or rows from its own box, and Storybook stages only
 * the canvas it is given, so the small panel's single-child result and its
 * rows are shot here. Run by `pnpm vrt:capture` only. The clock is fixed and
 * the fixture's times are relative to it, so a shot changes only when the
 * rendering does. The file names are the baseline keys.
 */

const shotPath = (name: string) =>
  `${inject("vrtActualDir")}/platform/${name}.png`

const renderDevicePage = (snapshot: DisplaySnapshot) => {
  document.documentElement.dataset.scheme =
    snapshot.view.theme
  return render(
    <main
      class="platform"
      data-device="true"
      data-scheme={snapshot.view.theme}
    >
      <DisplayComposition
        snapshot={snapshot}
        isConnected
        onAction={async () => undefined}
      />
    </main>,
  )
}

const capture = async (name: string) => {
  await document.fonts.ready
  await new Promise((onFrame) =>
    requestAnimationFrame(() => onFrame(undefined)),
  )
  await page.screenshot({
    path: shotPath(name),
    element: document.body,
  })
}

beforeAll(() => {
  vi.useFakeTimers({
    now: SCREENSHOT_EPOCH_MILLIS,
    toFake: ["Date"],
  })
})

afterAll(() => {
  vi.useRealTimers()
})

afterEach(() => page.viewport(414, 896))

test("a scan on a small square panel is that child alone", async () => {
  await page.viewport(480, 480)
  renderDevicePage(kidsPointsFixture({ hasScan: true }))
  expect(
    document.querySelector(".kids-points-focus"),
  ).not.toBeNull()
  await capture("kids-points-scan-480x480")
})

test("a short panel with no scan lists the children as rows", async () => {
  await page.viewport(480, 320)
  renderDevicePage(kidsPointsFixture({ hasScan: false }))
  expect(
    document.querySelector(".kids-points-rows"),
  ).not.toBeNull()
  await capture("kids-points-rows-480x320")
})

test("a scan on a wide panel marks that child on the board", async () => {
  await page.viewport(1280, 720)
  renderDevicePage(kidsPointsFixture({ hasScan: true }))
  expect(
    document.querySelector(
      '.kids-points-card[data-scanned="true"]',
    ),
  ).not.toBeNull()
  document
    .querySelectorAll(".kids-points-card")
    .forEach((card) => {
      expect(card.scrollHeight).toBeLessThanOrEqual(
        card.clientHeight + 1,
      )
    })
  await capture("kids-points-scan-1280x720")
})

test("a portrait phone fills the panel with stacked cards", async () => {
  await page.viewport(390, 844)
  const snapshot = kidsPointsFixture({ hasScan: false })
  const channel = snapshot.channels.points!
  const data =
    channel.data as import("@castkit/sdk/contracts").ContractData["kids-points.v1"]
  renderDevicePage({
    ...snapshot,
    channels: {
      points: {
        ...channel,
        data: { ...data, kids: data.kids.slice(0, 3) },
      },
    },
  })
  const board = document.querySelector(
    ".kids-points-board",
  )!
  expect(board.getAttribute("data-stacked")).toBe("true")
  const cards = Array.from(
    board.querySelectorAll(".kids-points-card"),
  )
  expect(cards).toHaveLength(3)
  const boardBounds = board.getBoundingClientRect()
  const firstCard = cards.at(0)
  const lastCard = cards.at(-1)
  if (!firstCard || !lastCard) {
    throw new Error("The phone must show complete cards")
  }
  const lastBounds = lastCard.getBoundingClientRect()
  expect(
    Math.abs(lastBounds.bottom - boardBounds.bottom),
  ).toBeLessThan(1)
  const total = firstCard.querySelector(
    ".kids-points-total strong",
  )
  const goal = firstCard.querySelector(
    ".kids-points-total-label",
  )
  if (!total || !goal) {
    throw new Error(
      "The card must show earned points and a goal",
    )
  }
  expect(
    Number.parseFloat(getComputedStyle(total).fontSize),
  ).toBeGreaterThan(
    Number.parseFloat(getComputedStyle(goal).fontSize),
  )
  await capture("kids-points-stacked-390x844")
})

test("compact phone rows also use the full height", async () => {
  await page.viewport(320, 568)
  renderDevicePage(kidsPointsFixture({ hasScan: false }))
  const rows = document.querySelector(".kids-points-rows")
  const lastRow = rows?.querySelector(
    ".kids-points-row:last-child",
  )
  if (!rows || !lastRow) {
    throw new Error(
      "The compact phone must show complete rows",
    )
  }
  expect(
    Math.abs(
      rows.getBoundingClientRect().bottom -
        lastRow.getBoundingClientRect().bottom,
    ),
  ).toBeLessThan(1)
  await capture("kids-points-rows-320x568")
})

const countdownSnapshot = (): DisplaySnapshot => {
  const snapshot = kidsPointsFixture({ hasScan: true })
  const points = snapshot.channels.points!
  const data =
    points.data as import("@castkit/sdk/contracts").ContractData["kids-points.v1"]
  const atMs = SCREENSHOT_EPOCH_MILLIS - 204_000
  return {
    ...snapshot,
    channels: {
      points: {
        ...points,
        data: {
          kids: data.kids.map((kid) =>
            kid.id === data.lastScan?.kidId
              ? {
                  ...kid,
                  activeTask: {
                    name: "Sitting Still",
                    startedAtMs: atMs,
                    goalMinutes: 6,
                    isCountdown: true,
                  },
                }
              : kid,
          ),
          lastScan: {
            ...data.lastScan!,
            result: "started",
            taskName: "Sitting Still",
            points: 0,
            atMs,
          },
        },
      },
    },
  }
}

test("a countdown fits a short panel and a small square", async () => {
  await page.viewport(480, 320)
  const short = renderDevicePage(countdownSnapshot())
  expect(
    document.querySelector(".kids-points-countdown-times")
      ?.textContent,
  ).toContain("2:36")
  await capture("kids-points-countdown-480x320")
  short.unmount()
  await page.viewport(480, 480)
  renderDevicePage(countdownSnapshot())
  await capture("kids-points-countdown-480x480")
})

const timerSnapshot = (
  theme: "light" | "dark",
): DisplaySnapshot => {
  const fixture = kidsPointsFixture({ hasScan: false })
  const channel = fixture.channels.points!
  const data =
    channel.data as ContractData["kids-points.v1"]
  const startedAtMs = SCREENSHOT_EPOCH_MILLIS - 60_000
  const timerScans = ["robin", "sky"].map((kidId) => ({
    kidId,
    result: "started" as const,
    points: 0,
    taskName: "Sitting Still",
    atMs: startedAtMs,
  }))
  return {
    ...fixture,
    view: { ...fixture.view, theme },
    channels: {
      points: {
        ...channel,
        data: {
          ...data,
          kids: data.kids.map((kid) =>
            kid.id === "robin" || kid.id === "sky"
              ? {
                  ...kid,
                  activeTask: {
                    name: "Sitting Still",
                    startedAtMs,
                    goalMinutes:
                      kid.id === "robin" ? 7 : 10,
                    isCountdown: true,
                  },
                }
              : kid,
          ),
          lastScan: timerScans[1],
          timerScans,
        },
      },
    },
  }
}

test.each([
  "light",
  "dark",
] as const)("two countdowns fit a short panel in %s", async (theme) => {
  await page.viewport(480, 320)
  renderDevicePage(timerSnapshot(theme))
  expect(
    document.querySelectorAll(".kids-points-timer-card"),
  ).toHaveLength(2)
  document
    .querySelectorAll(".kids-points-timer-card")
    .forEach((card) => {
      const box = card.getBoundingClientRect()
      card
        .querySelectorAll("h3, p, .kids-points-bar")
        .forEach((element) => {
          const child = element.getBoundingClientRect()
          expect(child.top).toBeGreaterThanOrEqual(box.top)
          expect(child.bottom).toBeLessThanOrEqual(
            box.bottom,
          )
          expect(child.left).toBeGreaterThanOrEqual(
            box.left,
          )
          expect(child.right).toBeLessThanOrEqual(box.right)
        })
    })
  await capture(`kids-points-two-timers-480x320-${theme}`)
})

const compactBoardSnapshot = ({
  isAllChildrenVisible,
  hasScan,
}: {
  isAllChildrenVisible: boolean
  hasScan: boolean
}): DisplaySnapshot => {
  const snapshot = kidsPointsFixture({ hasScan })
  const channel = snapshot.channels.points!
  const data =
    channel.data as ContractData["kids-points.v1"]
  return {
    ...snapshot,
    view: {
      ...snapshot.view,
      panels: snapshot.view.panels.map((panel) => ({
        ...panel,
        settings: { isAllChildrenVisible, scanSeconds: 30 },
      })),
    },
    channels: {
      points: {
        ...channel,
        data: {
          ...data,
          kids: data.kids.slice(0, 3).map((kid, index) => ({
            ...kid,
            ...(index < 2
              ? {
                  activeTask: {
                    name:
                      index === 0 ? "Reading" : "Sitting",
                    startedAtMs:
                      Date.now() -
                      (index === 0 ? 120_000 : 60_000),
                    isCountdown: index === 1,
                    ...(index === 1
                      ? { goalMinutes: 5 }
                      : {}),
                  },
                }
              : {}),
          })),
        },
      },
    },
  }
}

test("a compact scan board can keep three children and two activities visible", async () => {
  await page.viewport(480, 480)
  renderDevicePage(
    compactBoardSnapshot({
      isAllChildrenVisible: true,
      hasScan: true,
    }),
  )
  await document.fonts.ready
  const rows = Array.from(
    document.querySelectorAll(".kids-points-row"),
  )
  expect(rows).toHaveLength(3)
  rows.forEach((row) => {
    const name = row.querySelector("h3")
    if (!name)
      throw new Error("Each row must identify its child")
    const nameSize = Number.parseFloat(
      getComputedStyle(name).fontSize,
    )
    const initialSize = Number.parseFloat(
      getComputedStyle(name, "::first-letter").fontSize,
    )
    expect(nameSize).toBeGreaterThanOrEqual(26)
    expect(initialSize).toBeGreaterThanOrEqual(
      nameSize * 1.6,
    )
    expect(name.scrollWidth).toBeLessThanOrEqual(
      name.clientWidth + 1,
    )
    const total = row.querySelector(
      ".kids-points-row-total strong",
    )
    if (!total)
      throw new Error("Each row must show earned points")
    expect(
      Number.parseFloat(getComputedStyle(total).fontSize),
    ).toBeGreaterThanOrEqual(60)
    expect(row.scrollHeight).toBeLessThanOrEqual(
      row.clientHeight + 1,
    )
    expect(
      row.getBoundingClientRect().bottom,
    ).toBeLessThanOrEqual(480)
  })
  await capture("kids-points-all-children-scan-480x480")
})

test("the compact board keeps both timers visible after scan feedback ends", async () => {
  await page.viewport(480, 480)
  renderDevicePage(
    compactBoardSnapshot({
      isAllChildrenVisible: true,
      hasScan: false,
    }),
  )
  await capture("kids-points-all-children-timers-480x480")
})

test("the default compact scan still focuses on one child", async () => {
  await page.viewport(480, 480)
  renderDevicePage(
    compactBoardSnapshot({
      isAllChildrenVisible: false,
      hasScan: true,
    }),
  )
  await capture("kids-points-default-scan-480x480")
})

test("large initials preserve complete longer names and totals on a compact board", async () => {
  await page.viewport(480, 480)
  const snapshot = compactBoardSnapshot({
    isAllChildrenVisible: true,
    hasScan: false,
  })
  const channel = snapshot.channels.points!
  const data =
    channel.data as ContractData["kids-points.v1"]
  renderDevicePage({
    ...snapshot,
    channels: {
      points: {
        ...channel,
        data: {
          ...data,
          kids: data.kids.map((kid, index) => ({
            ...kid,
            name:
              ["Alexandra", "Robin", "Christopher"][
                index
              ] ?? kid.name,
            pointsToday: 1234,
          })),
        },
      },
    },
  })
  await document.fonts.ready
  document
    .querySelectorAll(".kids-points-row h3")
    .forEach((name) => {
      expect(name.scrollWidth).toBeLessThanOrEqual(
        name.clientWidth + 1,
      )
    })
  await capture(
    "kids-points-all-children-long-names-480x480",
  )
})

test("a shorter all-child panel omits rows before shrinking primary values", async () => {
  await page.viewport(480, 320)
  renderDevicePage(
    compactBoardSnapshot({
      isAllChildrenVisible: true,
      hasScan: false,
    }),
  )
  await document.fonts.ready
  const rows = Array.from(
    document.querySelectorAll(".kids-points-row"),
  )
  expect(rows).toHaveLength(1)
  expect(
    document.querySelector(".kids-points-overflow")
      ?.textContent,
  ).toBe("2 more")
  rows.forEach((row) => {
    expect(row.scrollHeight).toBeLessThanOrEqual(
      row.clientHeight + 1,
    )
    expect(
      row.getBoundingClientRect().bottom,
    ).toBeLessThanOrEqual(320)
  })
  await capture("kids-points-all-children-rows-480x320")
})

const countUpSnapshot = (
  theme: "dark" | "light",
): DisplaySnapshot => {
  const snapshot = kidsPointsFixture({ hasScan: false })
  const channel = snapshot.channels.points!
  const data =
    channel.data as ContractData["kids-points.v1"]
  const startedAtMs = Date.now()
  return {
    ...snapshot,
    view: {
      ...snapshot.view,
      theme,
      panels: snapshot.view.panels.map((panel) => ({
        ...panel,
        settings: {
          isAllChildrenVisible: true,
          scanSeconds: 30,
        },
      })),
    },
    channels: {
      points: {
        ...channel,
        data: {
          kids: data.kids.slice(0, 3).map((kid, index) =>
            index === 0
              ? {
                  ...kid,
                  activeTask: {
                    name: "Instrument Practice",
                    startedAtMs,
                    bankedMinutes: 27,
                    isCountdown: false,
                    reader: "Practice Reader",
                  },
                }
              : kid,
          ),
          lastScan: {
            kidId: data.kids[0]?.id,
            taskName: "Instrument Practice",
            result: "started",
            points: 0,
            atMs: startedAtMs,
          },
        },
      },
    },
  }
}

test.each([
  "dark",
  "light",
] as const)("a count-up keeps all three children readable on a square in %s", async (theme) => {
  await page.viewport(480, 480)
  const snapshot = countUpSnapshot(theme)
  renderDevicePage({
    ...snapshot,
    displayProperties: {
      ...snapshot.displayProperties,
      repaint: "fast",
    },
  })
  await document.fonts.ready
  expect(
    document.querySelector(".kids-points-countup-total"),
  ).toHaveTextContent("27min total")
  expect(
    document.querySelector(".kids-points-countup-session"),
  ).toHaveTextContent("0 min this session")
  const rows = document.querySelectorAll(".kids-points-row")
  expect(rows).toHaveLength(3)
  rows.forEach((row) => {
    expect(row.scrollHeight).toBeLessThanOrEqual(
      row.clientHeight + 1,
    )
    const box = row.getBoundingClientRect()
    row.querySelectorAll("h3,p,strong").forEach((child) => {
      const bounds = child.getBoundingClientRect()
      expect(bounds.top).toBeGreaterThanOrEqual(box.top - 1)
      expect(bounds.bottom).toBeLessThanOrEqual(
        box.bottom + 1,
      )
      expect(bounds.right).toBeLessThanOrEqual(
        box.right + 1,
      )
    })
  })
  const primary = document.querySelector(
    ".kids-points-countup-total strong",
  )!
  const secondary = document.querySelector(
    ".kids-points-countup-session",
  )!
  expect(
    Number.parseFloat(getComputedStyle(primary).fontSize),
  ).toBeGreaterThan(
    Number.parseFloat(getComputedStyle(secondary).fontSize),
  )
  await capture(`kids-points-countup-480x480-${theme}`)
})

test("a focused count-up and simultaneous mixed timers fit a short panel", async () => {
  await page.viewport(480, 320)
  const snapshot = countUpSnapshot("dark")
  const points = snapshot.channels.points!
  const data = points.data as ContractData["kids-points.v1"]
  const focused = {
    ...snapshot,
    view: {
      ...snapshot.view,
      panels: snapshot.view.panels.map((panel) => ({
        ...panel,
        settings: { scanSeconds: 30 },
      })),
    },
  }
  const first = renderDevicePage(focused)
  await capture("kids-points-countup-focus-480x320")
  first.unmount()
  renderDevicePage({
    ...focused,
    channels: {
      points: {
        ...points,
        data: {
          ...data,
          kids: data.kids.slice(0, 2).map((kid, index) =>
            index === 0
              ? kid
              : {
                  ...kid,
                  activeTask: {
                    name: "Quiet Time",
                    reader: "Practice Reader",
                    isCountdown: true,
                    goalMinutes: 5,
                    startedAtMs: Date.now() - 60_000,
                  },
                },
          ),
        },
      },
    },
  })
  await document.fonts.ready
  expect(
    document.querySelectorAll(".kids-points-timer-card"),
  ).toHaveLength(2)
  document
    .querySelectorAll(".kids-points-timer-card")
    .forEach((card) => {
      expect(card.scrollHeight).toBeLessThanOrEqual(
        card.clientHeight + 1,
      )
      expect(card.scrollWidth).toBeLessThanOrEqual(
        card.clientWidth + 1,
      )
    })
  await capture("kids-points-mixed-timers-480x320")
})
