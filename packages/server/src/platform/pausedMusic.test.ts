import type { ChannelSnapshot } from "@castkit/sdk/contracts"
import { afterEach, expect, test, vi } from "vitest"
import {
  createPausedMusic,
  MINIMUM_PLAY_SECONDS,
  PAUSED_ACTIVE_SECONDS,
} from "./pausedMusic.ts"

const music = (isPlaying: boolean): ChannelSnapshot => ({
  id: "music/now-playing",
  type: "now-playing.v1",
  data: {
    title: "Track One",
    artist: "Artist One",
    isPlaying,
  },
  status: "ready",
})

const clock = () => {
  const state = { ms: 1_000_000 }
  return {
    now: () => state.ms,
    advance: (seconds: number) => {
      state.ms += seconds * 1000
    },
  }
}

afterEach(() => {
  vi.useRealTimers()
})

test("a pause after real playback stays active for ten minutes", () => {
  const time = clock()
  const paused = createPausedMusic({ now: time.now })
  paused.observe(music(true))
  time.advance(MINIMUM_PLAY_SECONDS + 60)
  paused.observe(music(false))
  expect(
    paused.isRecentlyPaused("music/now-playing"),
  ).toBe(true)
  time.advance(PAUSED_ACTIVE_SECONDS - 1)
  expect(
    paused.isRecentlyPaused("music/now-playing"),
  ).toBe(true)
  time.advance(1)
  expect(
    paused.isRecentlyPaused("music/now-playing"),
  ).toBe(false)
  paused.dispose()
})

test("the same paused card published again does not restart the ten minutes", () => {
  const time = clock()
  const paused = createPausedMusic({ now: time.now })
  paused.observe(music(true))
  time.advance(120)
  paused.observe(music(false))
  time.advance(PAUSED_ACTIVE_SECONDS - 10)
  paused.observe(music(false))
  time.advance(10)
  expect(
    paused.isRecentlyPaused("music/now-playing"),
  ).toBe(false)
  paused.dispose()
})

test("an announcement burst neither starts nor restarts the ten minutes", () => {
  const time = clock()
  const paused = createPausedMusic({ now: time.now })
  paused.observe(music(true))
  time.advance(3)
  paused.observe(music(false))
  expect(
    paused.isRecentlyPaused("music/now-playing"),
  ).toBe(false)

  paused.observe(music(true))
  time.advance(300)
  paused.observe(music(false))
  time.advance(PAUSED_ACTIVE_SECONDS - 60)
  paused.observe(music(true))
  time.advance(3)
  paused.observe(music(false))
  time.advance(57)
  expect(
    paused.isRecentlyPaused("music/now-playing"),
  ).toBe(false)
  paused.dispose()
})

test("nothing is known about a stop that happened before the server started", () => {
  const time = clock()
  const paused = createPausedMusic({ now: time.now })
  paused.observe(music(false))
  expect(
    paused.isRecentlyPaused("music/now-playing"),
  ).toBe(false)
  paused.dispose()
})

test("the end of the ten minutes asks for every snapshot to be sent again", () => {
  vi.useFakeTimers()
  const onExpire = vi.fn()
  const paused = createPausedMusic({ onExpire })
  paused.observe(music(true))
  vi.advanceTimersByTime(60_000)
  paused.observe(music(false))
  vi.advanceTimersByTime(PAUSED_ACTIVE_SECONDS * 1000 - 1)
  expect(onExpire).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1)
  expect(onExpire).toHaveBeenCalledOnce()
  paused.dispose()
})
