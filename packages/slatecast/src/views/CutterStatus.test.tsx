import { render, screen } from "@testing-library/preact"
import { expect, test } from "vitest"
import { page } from "vitest/browser"
import {
  buildCutter,
  buildCuttingJob,
  buildRecentJobs,
} from "../__fixtures__/buildCutters.ts"
import { DisplayPropertiesContext } from "../platform/displayProperties.ts"
import { CutterStatus } from "./CutterStatus.tsx"
import "../styles.css"

const NOW_MILLIS = Date.now()

test("a cutting job counts down to its estimated finish and draws its cut lines", async () => {
  await page.viewport(1280, 720)
  render(
    <CutterStatus
      data={{
        cutters: [
          buildCutter({
            nowMillis: NOW_MILLIS,
            currentJob: buildCuttingJob({
              nowMillis: NOW_MILLIS,
              remainingSeconds: 150,
            }),
          }),
        ],
      }}
    />,
  )
  expect(
    screen.getByRole("heading", { name: "Example Cutter" }),
  ).toBeVisible()
  expect(
    screen.getByText(
      "Plugged into Craft room PC · Firmware V1.2",
    ),
  ).toBeVisible()
  expect(
    screen.getByText("Cutting — about 3 min left"),
  ).toBeVisible()
  expect(screen.getByText(/^Done about /)).toBeVisible()
  expect(
    screen.getByRole("img", {
      name: "Cut lines for Star wall decal",
    }),
  ).toBeVisible()
  expect(
    document.querySelectorAll(
      ".cutter-picture .cutter-path.is-cut",
    ),
  ).toHaveLength(3)
})

test("a super-slow panel shows the finish as a clock time, never a countdown", () => {
  render(
    <DisplayPropertiesContext.Provider
      value={{ repaint: "super-slow", delivery: "image" }}
    >
      <CutterStatus
        data={{
          cutters: [
            buildCutter({
              nowMillis: NOW_MILLIS,
              currentJob: buildCuttingJob({
                nowMillis: NOW_MILLIS,
              }),
            }),
          ],
        }}
      />
    </DisplayPropertiesContext.Provider>,
  )
  expect(screen.queryByText(/left$/)).toBeNull()
  expect(screen.getByText(/^Done about /)).toBeVisible()
})

test("a finished job is called finished by estimate, because the cutter never reports it", () => {
  render(
    <CutterStatus
      data={{
        cutters: [
          buildCutter({
            nowMillis: NOW_MILLIS,
            recentJobs: [
              {
                ...buildCuttingJob({
                  nowMillis: NOW_MILLIS,
                  remainingSeconds: -60,
                }),
                status: "done",
                finishedAtMs: NOW_MILLIS - 60_000,
              },
            ],
          }),
        ],
      }}
    />,
  )
  expect(screen.getByText("Finished")).toBeVisible()
  expect(
    screen.getByText("Finished (estimated)"),
  ).toBeVisible()
})

test("an idle cutter is ready and lists its recent jobs without a row cut in half", async () => {
  await page.viewport(720, 720)
  render(
    <CutterStatus
      data={{
        cutters: [buildCutter({ nowMillis: NOW_MILLIS })],
      }}
    />,
  )
  expect(screen.getByText("Ready to cut")).toBeVisible()
  expect(screen.getByText("Gift tags")).toBeVisible()
  const list = document.querySelector(".cutter-recent-list")
  const listBottom =
    list?.getBoundingClientRect().bottom ?? 0
  const listRight = list?.getBoundingClientRect().right ?? 0
  const drawnRows = Array.from(
    document.querySelectorAll(".cutter-recent-row"),
  ).filter(
    (row) => row.getBoundingClientRect().left < listRight,
  )
  expect(drawnRows.length).toBeGreaterThan(0)
  expect(
    drawnRows.every(
      (row) =>
        row.getBoundingClientRect().bottom <=
        listBottom + 0.5,
    ),
  ).toBe(true)
})

test("an offline cutter and an unplugged cutter say so in words", () => {
  render(
    <CutterStatus
      data={{
        cutters: [
          buildCutter({
            nowMillis: NOW_MILLIS,
            isOnline: false,
            isCutterConnected: false,
          }),
          buildCutter({
            nowMillis: NOW_MILLIS,
            id: "cutter-2",
            name: "Second Cutter",
            isCutterConnected: false,
            recentJobs: buildRecentJobs(NOW_MILLIS),
          }),
        ],
      }}
    />,
  )
  expect(screen.getByText("Offline")).toBeVisible()
  expect(
    screen.getByText(
      /Cuttero has not heard from this cutter's computer since/,
    ),
  ).toBeVisible()
  expect(screen.getByText("Not connected")).toBeVisible()
  expect(
    screen.getByText(
      "The cutter is not answering. Turn it on and check its USB cable to Craft room PC.",
    ),
  ).toBeVisible()
})

test("the view waits for data and says when there are no cutters", () => {
  const { rerender } = render(<CutterStatus data={null} />)
  expect(
    screen.getByText("Waiting for cutter data."),
  ).toBeVisible()
  rerender(<CutterStatus data={{ cutters: [] }} />)
  expect(screen.getByText("No cutters yet.")).toBeVisible()
})
