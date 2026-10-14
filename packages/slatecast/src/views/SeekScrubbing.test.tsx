import { screen } from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { expect, test } from "vitest"
import {
  buildNowPlaying,
  buildSnapshot,
} from "../__fixtures__/buildSnapshot.ts"
import { mountSlatecast } from "../__tests__/setup/mountSlatecast.tsx"
import "../styles.css"

test("seek motion follows the finger immediately and restores playback smoothing after release", async () => {
  await mountSlatecast({
    snapshot: buildSnapshot({
      view: "now-playing",
      data: {
        nowPlaying: buildNowPlaying({
          isPlaying: false,
          positionSeconds: 0,
          durationSeconds: 200,
        }),
      },
    }),
  })
  const track = screen.getByRole("slider", { name: "Seek" })
  const knob = track.querySelector(
    ".seek-knob",
  ) as HTMLElement
  const fill = track.querySelector(
    ".seek-fill",
  ) as HTMLElement
  const smoothing = window.matchMedia(
    "(prefers-reduced-motion: no-preference)",
  ).matches
    ? "0.4s"
    : "0s"
  expect(getComputedStyle(knob).transitionDuration).toBe(
    smoothing,
  )
  const bounds = track.getBoundingClientRect()
  const point = (fraction: number) => ({
    target: track,
    coords: {
      clientX: bounds.left + bounds.width * fraction,
      clientY: bounds.top + bounds.height / 2,
    },
  })
  const user = userEvent.setup()
  await user.pointer([
    { ...point(0.2), keys: "[MouseLeft>]" },
    point(0.7),
  ])
  expect(getComputedStyle(knob).transitionDuration).toBe(
    "0s",
  )
  expect(getComputedStyle(fill).transitionDuration).toBe(
    "0s",
  )
  await user.pointer({
    ...point(0.7),
    keys: "[/MouseLeft]",
  })
  expect(getComputedStyle(knob).transitionDuration).toBe(
    smoothing,
  )
  expect(getComputedStyle(fill).transitionDuration).toBe(
    smoothing,
  )
})
