import { expect, test } from "vitest"
import {
  buildMusicPlayer,
  buildQueueItem,
} from "../__fixtures__/buildMusicPlayer.ts"
import {
  countUpcomingRows,
  findCurrentLyricIndex,
  readLivePositionSeconds,
  readSeekSeconds,
  resampleWaveform,
  splitQueue,
} from "./musicPlayerModel.ts"

test("a playing track moves on from its reported position and stops at the end", () => {
  const data = buildMusicPlayer({
    nowMs: 1000,
    positionSeconds: 10,
  })
  expect(
    readLivePositionSeconds({ data, nowMs: 6000 }),
  ).toBe(15)
  expect(
    readLivePositionSeconds({ data, nowMs: 10_000_000 }),
  ).toBe(data.current?.durationSeconds)
})

test("a paused track stays where it stopped", () => {
  const data = buildMusicPlayer({
    nowMs: 1000,
    state: "paused",
    positionSeconds: 10,
  })
  expect(
    readLivePositionSeconds({ data, nowMs: 60_000 }),
  ).toBe(10)
})

test("finds the lyric line being sung", () => {
  const lines = [
    { startSeconds: 5, text: "a" },
    { startSeconds: 10, text: "b" },
    { startSeconds: 15, text: "c" },
  ]
  expect(
    findCurrentLyricIndex({ lines, positionSeconds: 2 }),
  ).toBe(-1)
  expect(
    findCurrentLyricIndex({ lines, positionSeconds: 12 }),
  ).toBe(1)
  expect(
    findCurrentLyricIndex({ lines, positionSeconds: 99 }),
  ).toBe(2)
})

test("splits the queue around the current row and keeps the latest played rows", () => {
  const items = [5, 3, 4, 6, 7].map(buildQueueItem)
  const { played, current, upcoming } = splitQueue({
    items,
    currentIndex: 5,
    playedRowCount: 1,
  })
  expect(played.map((item) => item.index)).toEqual([4])
  expect(current?.index).toBe(5)
  expect(upcoming.map((item) => item.index)).toEqual([6, 7])
})

test("resamples a waveform by peaks to the bars that fit", () => {
  expect(
    resampleWaveform({
      values: [0.1, 0.8, 0.3, 0.2],
      barCount: 2,
    }),
  ).toEqual([0.8, 0.3])
  expect(
    resampleWaveform({ values: [0.5], barCount: 3 }),
  ).toEqual([0.5, 0.5, 0.5])
  expect(
    resampleWaveform({ values: [], barCount: 3 }),
  ).toEqual([])
})

test("clamps a seek to the track", () => {
  expect(
    readSeekSeconds({
      fraction: 1.4,
      durationSeconds: 200,
    }),
  ).toBe(200)
  expect(
    readSeekSeconds({
      fraction: 0.25,
      durationSeconds: 200,
    }),
  ).toBe(50)
})

test("counts only the upcoming rows that finish inside the list", () => {
  expect(
    countUpcomingRows({
      listHeight: 556,
      rowHeight: 46,
      labelHeight: 26,
      playedRowCount: 2,
      hasCurrent: true,
    }),
  ).toBe(7)
  expect(
    countUpcomingRows({
      listHeight: 100,
      rowHeight: 46,
      labelHeight: 26,
      playedRowCount: 2,
      hasCurrent: true,
    }),
  ).toBe(0)
})
