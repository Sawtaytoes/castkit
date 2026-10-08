import { screen, waitFor } from "@testing-library/preact"
import { expect, test } from "vitest"
import {
  buildNowPlaying,
  buildSnapshot,
} from "../__fixtures__/buildSnapshot.ts"
import { mountSlatecast } from "../__tests__/setup/mountSlatecast.tsx"
import { getCachedAccentColor } from "../accentColor.ts"
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
  const resolveColor = (property: string) => {
    const probe = document.createElement("span")
    probe.style.color = `var(${property})`
    panel.append(probe)
    const value = getComputedStyle(probe).color
    probe.remove()
    return value
  }
  const foreground = resolveColor("--fg")
  const mutedForeground = resolveColor("--fg-dim")
  expect(getComputedStyle(seekTime).color).toBe(
    mutedForeground,
  )
  expect(getComputedStyle(volumeIcon).color).toBe(
    foreground,
  )
  expect(getComputedStyle(seekTime).color).not.toBe(
    getComputedStyle(seekKnob).backgroundColor,
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
  expect(getComputedStyle(seekTime).color).toBe(
    mutedForeground,
  )
  expect(getComputedStyle(volumeIcon).color).toBe(
    foreground,
  )
  server.push({
    type: "now_playing",
    data: buildNowPlaying({
      title: "A track without artwork",
    }),
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

test("black-and-white artwork supplies a readable neutral accent instead of the theme hue", async () => {
  const artworkPath = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#222"/><rect x="4" y="4" width="8" height="8" fill="#ddd"/></svg>')}`
  const { view } = await mountSlatecast({
    snapshot: buildSnapshot({
      view: "now-playing",
      data: {
        nowPlaying: buildNowPlaying({
          artworkPath,
          title: "Neutral artwork fixture",
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
    expect(panel.style.getPropertyValue("--accent")).toBe(
      getCachedAccentColor(artworkPath),
    ),
  )
  const accent = panel.style.getPropertyValue("--accent")
  const channels = accent.match(/\d+/g)?.map(Number)
  expect(channels).toHaveLength(3)
  expect(new Set(channels).size).toBe(1)
  expect(getCachedAccentColor(artworkPath)).toBe(accent)
  expect(
    getComputedStyle(
      screen.getByRole("button", { name: "Mute" }),
    ).color,
  ).not.toBe(
    getComputedStyle(
      view.container.querySelector<HTMLElement>(
        ".seek-knob",
      )!,
    ).backgroundColor,
  )
})

test("a playing track retains its hue across artwork proxy changes, failures and view returns", async () => {
  const artworkPath = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#c03020"/></svg>')}`
  const data = buildNowPlaying({
    title: "Stable artwork fixture",
    artworkPath,
  })
  const { server, view } = await mountSlatecast({
    snapshot: buildSnapshot({
      view: "now-playing",
      data: { nowPlaying: data },
    }),
  })
  const panel = () =>
    view.container.querySelector<HTMLElement>(
      ".now-playing",
    )!
  await waitFor(() =>
    expect(
      panel().style.getPropertyValue("--accent"),
    ).not.toBe(""),
  )
  const accent = panel().style.getPropertyValue("--accent")
  const observed: string[] = []
  const observer = new MutationObserver(() => {
    observed.push(
      panel().style.getPropertyValue("--accent"),
    )
  })
  observer.observe(panel(), {
    attributes: true,
    attributeFilter: ["style"],
  })
  server.push({
    type: "now_playing",
    data: {
      ...data,
      artworkPath: "data:image/png;base64,invalid",
      isPlaying: false,
    },
  })
  await waitFor(() =>
    expect(
      screen.getByRole("button", {
        name: "Play Stable artwork fixture",
      }),
    ).toBeVisible(),
  )
  await new Promise((resolve) => setTimeout(resolve, 50))
  expect(panel().style.getPropertyValue("--accent")).toBe(
    accent,
  )
  expect(observed.every((value) => value === accent)).toBe(
    true,
  )
  observer.disconnect()
  server.push({ type: "view", view: "queue" })
  await waitFor(() =>
    expect(
      view.container.querySelector(".now-playing"),
    ).toBeNull(),
  )
  server.push({ type: "view", view: "now-playing" })
  await waitFor(() =>
    expect(panel().style.getPropertyValue("--accent")).toBe(
      accent,
    ),
  )
  server.push({
    type: "now_playing",
    data: { ...data, artworkPath: undefined },
  })
  await waitFor(() =>
    expect(
      panel().querySelector(".artwork.placeholder"),
    ).not.toBeNull(),
  )
  expect(panel().style.getPropertyValue("--accent")).toBe(
    accent,
  )
})
