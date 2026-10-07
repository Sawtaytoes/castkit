import { screen, waitFor } from "@testing-library/preact"
import { expect, test } from "vitest"
import {
  buildNowPlaying,
  buildSnapshot,
} from "../__fixtures__/buildSnapshot.ts"
import { mountSlatecast } from "../__tests__/setup/mountSlatecast.tsx"
import "../styles.css"

test("artwork changes update control colors and missing artwork restores the theme", async () => {
  const artwork = (color: string) => {
    const canvas = document.createElement("canvas")
    canvas.width = 16
    canvas.height = 16
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Canvas is unavailable")
    context.fillStyle = color
    context.fillRect(0, 0, 16, 16)
    return canvas.toDataURL()
  }
  const { server, view } = await mountSlatecast({
    snapshot: buildSnapshot({
      view: "now-playing",
      data: {
        nowPlaying: buildNowPlaying({
          artworkPath: artwork("#d06020"),
        }),
      },
    }),
  })
  const panel =
    view.container.querySelector<HTMLElement>(
      ".now-playing",
    )
  if (!panel)
    throw new Error("The music panel did not mount")
  await waitFor(() =>
    expect(
      panel.style.getPropertyValue("--accent"),
    ).not.toBe(""),
  )
  const firstAccent =
    panel.style.getPropertyValue("--accent")
  const seekTime =
    view.container.querySelector<HTMLElement>(".seek-time")
  const seekKnob =
    view.container.querySelector<HTMLElement>(".seek-knob")
  const volumeIcon = screen.getByRole("button", {
    name: "Mute",
  })
  if (!seekTime || !seekKnob)
    throw new Error("The seek controls did not mount")
  expect(getComputedStyle(seekTime).color).toBe(
    getComputedStyle(seekKnob).backgroundColor,
  )
  expect(getComputedStyle(volumeIcon).color).toBe(
    getComputedStyle(seekTime).color,
  )
  server.push({
    type: "now_playing",
    data: buildNowPlaying({
      artworkPath: artwork("#3060c0"),
    }),
  })
  await waitFor(() => {
    expect(
      panel.style.getPropertyValue("--accent"),
    ).not.toBe("")
    expect(
      panel.style.getPropertyValue("--accent"),
    ).not.toBe(firstAccent)
    expect(
      panel.style.getPropertyValue("--accent-content"),
    ).toBe(panel.style.getPropertyValue("--accent"))
  })
  server.push({
    type: "now_playing",
    data: buildNowPlaying(),
  })
  await waitFor(() =>
    expect(panel.style.getPropertyValue("--accent")).toBe(
      "",
    ),
  )
  expect(
    panel.style.getPropertyValue("--accent-content"),
  ).toBe("")
})
