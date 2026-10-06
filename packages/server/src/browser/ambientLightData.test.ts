import { expect, test } from "vitest"
import { buildAmbientLightData } from "./ambientLightData.ts"

test("missing feeds cannot invent progress or a meeting deadline", () => {
  expect(
    buildAmbientLightData({ data: {}, nowMs: 10000 }),
  ).toEqual({
    progress: 0,
    isPlaying: false,
    durationSeconds: null,
    secondsUntilEvent: null,
    weather: "",
  })
})
test("playing time advances, clamps at the end, and the next timed event excludes all-day and past events", () => {
  const data = {
    nowPlaying: {
      artist: "Artist",
      title: "Track",
      isPlaying: true,
      positionSeconds: 40,
      positionUpdatedAtMs: 10000,
      durationSeconds: 100,
    },
    weather: {
      temperatureText: "20°",
      conditionText: "Rain",
      condition: "rainy" as const,
    },
    agenda: {
      events: [
        {
          summary: "All day",
          startMs: 25000,
          isAllDay: true,
        },
        {
          summary: "Past",
          startMs: 19000,
          isAllDay: false,
        },
        {
          summary: "Later",
          startMs: 60000,
          isAllDay: false,
        },
        {
          summary: "Next",
          startMs: 30000,
          isAllDay: false,
        },
      ],
    },
  }
  expect(
    buildAmbientLightData({ data, nowMs: 20000 }),
  ).toEqual({
    progress: 0.5,
    isPlaying: true,
    durationSeconds: 100,
    secondsUntilEvent: 10,
    weather: "rainy",
  })
  expect(
    buildAmbientLightData({ data, nowMs: 999000 }).progress,
  ).toBe(1)
  expect(
    buildAmbientLightData({
      data: {
        ...data,
        nowPlaying: {
          ...data.nowPlaying,
          isPlaying: false,
        },
      },
      nowMs: 20000,
    }).progress,
  ).toBe(0.4)
})
