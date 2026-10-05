import { expect, test } from "vitest"
import {
  buildCutter,
  buildCuttingJob,
} from "../__fixtures__/buildCutters.ts"
import {
  describeJobProgress,
  formatAboutDuration,
  formatCutLength,
  getEstimatedPercent,
  getHeadlineJob,
  SETTLED_HEADLINE_MILLIS,
} from "./cutterJob.ts"

const NOW_MILLIS = Date.UTC(2026, 0, 1, 12)
const formatTime = (millis: number) =>
  `T+${(millis - NOW_MILLIS) / 1000}s`

test("a duration is always an estimate, rounded up", () => {
  expect(formatAboutDuration(20)).toBe("under a minute")
  expect(formatAboutDuration(61)).toBe("about 2 min")
  expect(formatAboutDuration(3_900)).toBe(
    "about 1 h 05 min",
  )
})

test("a cut length reads in meters past one meter", () => {
  expect(formatCutLength(420)).toBe("42 cm")
  expect(formatCutLength(4_049.6)).toBe("4.0 m")
})

test("a job past its estimate SHOULD be finished; the source has not said it is", () => {
  const job = buildCuttingJob({
    nowMillis: NOW_MILLIS,
    remainingSeconds: -5,
  })
  expect(
    describeJobProgress({
      job,
      nowMillis: NOW_MILLIS,
      hasRelativeTimes: true,
      formatTime,
    }),
  ).toEqual({
    primary: "Should be finished (estimated)",
    secondary: "Expected about T+-5s",
  })
  expect(
    getEstimatedPercent({ job, nowMillis: NOW_MILLIS }),
  ).toBe(100)
})

test("a running cut fills the band by the share of its estimate that has passed", () => {
  const job = buildCuttingJob({
    nowMillis: NOW_MILLIS,
    remainingSeconds: 40,
    estimateSeconds: 160,
  })
  expect(
    getEstimatedPercent({ job, nowMillis: NOW_MILLIS }),
  ).toBe(75)
  expect(
    describeJobProgress({
      job,
      nowMillis: NOW_MILLIS,
      hasRelativeTimes: true,
      formatTime,
    }),
  ).toEqual({
    primary: "Cutting — under a minute left",
    secondary: "Done about T+40s",
  })
})

test("a finished job leads the card only for a few minutes", () => {
  const finished = {
    ...buildCuttingJob({ nowMillis: NOW_MILLIS }),
    status: "done" as const,
    finishedAtMs: NOW_MILLIS,
  }
  const cutter = buildCutter({
    nowMillis: NOW_MILLIS,
    recentJobs: [finished],
  })
  expect(
    getHeadlineJob({ cutter, nowMillis: NOW_MILLIS }),
  ).toBe(finished)
  expect(
    getHeadlineJob({
      cutter,
      nowMillis: NOW_MILLIS + SETTLED_HEADLINE_MILLIS + 1,
    }),
  ).toBeUndefined()
})
