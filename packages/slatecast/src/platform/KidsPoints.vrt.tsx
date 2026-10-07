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
