import {
  render,
  screen,
  waitFor,
} from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { expect, onTestFinished, test, vi } from "vitest"
import { page } from "vitest/browser"
import { buildMusicPlayer } from "../__fixtures__/buildMusicPlayer.ts"
import { CompactMusicPlayer } from "../views/CompactMusicPlayer.tsx"
import { pointsOverviewFixture } from "./__fixtures__/pointsOverview.ts"
import { DisplayComposition } from "./PlatformApp.tsx"
import "../styles.css"
import "./platform.css"

test("compact queue spends only spare height and transport stays bound", async () => {
  const onAction = vi.fn(async () => undefined)
  const content = (height: number) => (
    <div
      style={{ width: "300px", height, display: "flex" }}
    >
      <CompactMusicPlayer
        layout="side-by-side"
        isLyricsTabVisible
        playedRowCount={2}
        data={buildMusicPlayer({ nowMs: Date.now() })}
        isControlEnabled
        onAction={onAction}
      />
    </div>
  )
  const mounted = render(content(112))
  expect(
    screen.queryByLabelText("Upcoming music"),
  ).toBeNull()
  await userEvent.click(
    screen.getByRole("button", {
      name: "Pause",
      exact: true,
    }),
  )
  expect(onAction).toHaveBeenCalledWith("play_pause")
  mounted.rerender(content(218))
  await waitFor(() =>
    expect(
      screen
        .getByLabelText("Upcoming music")
        .querySelectorAll(".compact-music-row"),
    ).toHaveLength(2),
  )
  // Let ResizeObserver record the grown layout before shrinking it. The
  // initial observer's queued frame can render rows before that delivery;
  // shrinking back within the same frame would leave no observed size change.
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => resolve()),
    ),
  )
  mounted.rerender(content(112))
  await waitFor(
    () =>
      expect(
        screen.queryByLabelText("Upcoming music"),
      ).toBeNull(),
    { timeout: 3000 },
  )
})

test.each([
  { name: "normal", startDelay: undefined },
  { name: "delayed start", startDelay: 1500 },
])("the desk player opens its full queue and Back restores the priority overview ($name transition)", async ({
  startDelay,
}) => {
  const original = {
    width: window.innerWidth,
    height: window.innerHeight,
  }
  onTestFinished(() =>
    page.viewport(original.width, original.height),
  )
  await page.viewport(1024, 600)
  const snapshot = pointsOverviewFixture({
    hasMusic: true,
    isBusy: true,
    isRunning: true,
  })
  const onAction = vi.fn(async () => undefined)
  const mounted = render(
    <main class="platform" data-device="true">
      <DisplayComposition
        snapshot={snapshot}
        isConnected
        onAction={onAction}
      />
    </main>,
  )
  await document.fonts.ready
  const pointsPanel =
    mounted.container.querySelector<HTMLElement>(
      "[data-spec='kids-points']",
    )
  if (!pointsPanel) throw new Error("Missing Points panel")
  if (startDelay !== undefined) {
    // Hold the returning panel's first opacity keyframe beyond waitFor's
    // default deadline, without changing navigation or overview geometry.
    const animate = pointsPanel.animate.bind(pointsPanel)
    const delayed = vi
      .spyOn(pointsPanel, "animate")
      .mockImplementation((keyframes, options) =>
        animate(keyframes, {
          ...(typeof options === "object" ? options : {}),
          delay: startDelay,
          fill: "backwards",
        }),
      )
    onTestFinished(() => delayed.mockRestore())
  }
  const opener = screen.getByRole("button", {
    name: "Open full music player and queue",
  })
  await waitFor(() => expect(opener).toBeVisible())
  expect(
    screen.getByText("130", { exact: true }),
  ).toBeVisible()
  await userEvent.click(opener)
  await waitFor(() =>
    expect(
      screen.getByRole("tab", {
        name: "Queue",
        exact: true,
      }),
    ).toBeVisible(),
  )
  expect(
    mounted.container.querySelector(
      "[data-navigation-focus]",
    ),
  ).not.toBeNull()
  await userEvent.click(
    screen.getByRole("button", {
      name: "Pause",
      exact: true,
    }),
  )
  expect(onAction).toHaveBeenCalledWith({
    panelId: "music",
    action: "play_pause",
    payload: undefined,
  })
  await userEvent.click(
    screen.getByRole("button", {
      name: "Back to overview",
    }),
  )
  await waitFor(() =>
    expect(
      opener.isConnected
        ? opener
        : screen.getByRole("button", {
            name: "Open full music player and queue",
          }),
    ).toBeVisible(),
  )
  await waitFor(() => {
    expect(
      mounted.container.querySelector(
        "[data-navigation-focus]",
      ),
    ).toBeNull()
    expect(getComputedStyle(pointsPanel).display).not.toBe(
      "none",
    )
  })
  // The music opener is visible before the newly restored Points panel's
  // opacity transition completes. Wait for that panel, not unrelated effects.
  await Promise.all(
    pointsPanel
      .getAnimations()
      .map((animation) => animation.finished),
  )
  // The finished promise can resolve before Chromium publishes the final
  // computed opacity. Observe the next rendered frame before asserting it.
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => resolve()),
    ),
  )
  expect(
    screen.getByText("130", { exact: true }),
  ).toBeVisible()
})

test.each([
  "paused",
  "idle",
  "unavailable",
] as const)("an active-only overview retains paused music, not stopped music: %s", async (state) => {
  const base = pointsOverviewFixture({ hasMusic: true })
  const music = buildMusicPlayer({
    nowMs: Date.now(),
    state,
  })
  const content = (hasCurrent: boolean) => (
    <main class="platform" data-device="true">
      <DisplayComposition
        snapshot={{
          ...base,
          panelActivity: {
            ...base.panelActivity,
            music: false,
          },
          channels: {
            ...base.channels,
            music: {
              ...base.channels.music!,
              data: {
                ...music,
                current: hasCurrent
                  ? music.current
                  : undefined,
              },
            },
          },
        }}
        isConnected
        onAction={async () => undefined}
      />
    </main>
  )
  const mounted = render(content(true))
  const opener = () =>
    screen.queryByRole("button", {
      name: "Open full music player and queue",
    })
  if (state === "paused")
    await waitFor(() => expect(opener()).toBeVisible())
  else expect(opener()).toBeNull()
  mounted.rerender(content(false))
  await waitFor(() => expect(opener()).toBeNull())
})

test("the 720 by 900 overview gives spare height to complete upcoming queue rows", async () => {
  const original = {
    width: window.innerWidth,
    height: window.innerHeight,
  }
  onTestFinished(() =>
    page.viewport(original.width, original.height),
  )
  await page.viewport(720, 900)
  render(
    <main class="platform" data-device="true">
      <DisplayComposition
        snapshot={pointsOverviewFixture({ hasMusic: true })}
        isConnected
        onAction={async () => undefined}
      />
    </main>,
  )
  await document.fonts.ready
  await waitFor(() =>
    expect(
      screen.getByRole("region", {
        name: "Upcoming music",
      }),
    ).toBeVisible(),
  )
  await waitFor(() => {
    expect(
      screen.getByRole("heading", {
        name: "Quinn",
        exact: true,
      }),
    ).toBeVisible()
    const queue = screen.getByRole("region", {
      name: "Upcoming music",
    })
    const panel = queue
      .closest("[data-spec='music-player']")
      ?.getBoundingClientRect()
    if (!panel) throw new Error("Missing music panel")
    Array.from(
      queue.querySelectorAll(".compact-music-row"),
    ).forEach((row) => {
      expect(
        row.getBoundingClientRect().bottom,
      ).toBeLessThanOrEqual(panel.bottom)
    })
  })
})

test("the same card fills a wide allocation, then switches to the narrow layout when space shrinks", async () => {
  const content = (width: number, height: number) => (
    <main
      class="platform"
      style={{ width, height, padding: 0 }}
    >
      <CompactMusicPlayer
        data={buildMusicPlayer({ nowMs: Date.now() })}
        layout="side-by-side"
        isLyricsTabVisible
        playedRowCount={2}
        isControlEnabled
        onAction={async () => undefined}
      />
    </main>
  )
  const mounted = render(content(969, 219))
  const card = mounted.container.querySelector(
    ".compact-music",
  )
  if (!card) throw new Error("Missing compact card")
  await waitFor(() =>
    expect(card.getAttribute("data-layout")).toBe("wide"),
  )
  expect(
    card.querySelectorAll(".compact-music-row"),
  ).toHaveLength(6)
  expect(
    card.querySelector("img")?.getBoundingClientRect()
      .width,
  ).toBe(144)
  const rows = [
    ...card.querySelectorAll(".compact-music-row"),
  ]
  expect(
    rows[3]?.getBoundingClientRect().left,
  ).toBeGreaterThan(
    rows[0]?.getBoundingClientRect().right ?? 0,
  )
  expect(
    rows[1]?.getBoundingClientRect().top,
  ).toBeGreaterThan(
    rows[0]?.getBoundingClientRect().top ?? 0,
  )
  expect(rows[1]?.getBoundingClientRect().left).toBe(
    rows[0]?.getBoundingClientRect().left,
  )
  for (const row of rows)
    expect(
      row.getBoundingClientRect().bottom,
    ).toBeLessThanOrEqual(
      card.getBoundingClientRect().bottom,
    )
  mounted.rerender(content(308, 219))
  await waitFor(() =>
    expect(card.getAttribute("data-layout")).toBe(
      "stacked",
    ),
  )
  await waitFor(() =>
    expect(
      card.querySelectorAll(".compact-music-row"),
    ).toHaveLength(2),
  )
  // Even a minimum-height wide strip must keep all transport buttons inside it.
  mounted.rerender(content(969, 112))
  await waitFor(() =>
    expect(card.getAttribute("data-layout")).toBe("wide"),
  )
  for (const button of card.querySelectorAll(
    ".compact-music-controls button",
  ))
    expect(
      button.getBoundingClientRect().bottom,
    ).toBeLessThanOrEqual(
      card.getBoundingClientRect().bottom,
    )
})

test("compact upcoming rows expose safe artwork and play the exact queue item while disabled rows cannot act", async () => {
  const data = buildMusicPlayer({ nowMs: Date.now() })
  const onAction = vi.fn(async () => undefined)
  const content = (isControlEnabled: boolean) => (
    <main
      class="platform"
      style={{ width: 969, height: 219, padding: 0 }}
    >
      <CompactMusicPlayer
        data={data}
        layout="side-by-side"
        isLyricsTabVisible
        playedRowCount={2}
        isControlEnabled={isControlEnabled}
        onAction={onAction}
      />
    </main>
  )
  const mounted = render(content(true))
  const row = await screen.findByRole("button", {
    name: /Echo Park/,
  })
  expect(row.querySelector("img")).not.toBeNull()
  await userEvent.click(row)
  const item = data.queue?.items.find(
    (item) => item.title === "Echo Park",
  )
  if (!item) throw new Error("Missing upcoming track")
  expect(onAction).toHaveBeenCalledWith("play_item", {
    queueItemId: item.queueItemId,
  })
  mounted.rerender(content(false))
  expect(
    screen.getByRole("button", { name: /Echo Park/ }),
  ).toBeDisabled()
})

test("expanded playback draws a waveform that arrives after opening, and keeps seeking available while waiting", async () => {
  const value = pointsOverviewFixture({ hasMusic: true })
  const music = buildMusicPlayer({ nowMs: Date.now() })
  const content = (hasWaveform: boolean) => (
    <main class="platform" data-device="true">
      <DisplayComposition
        snapshot={{
          ...value,
          channels: {
            ...value.channels,
            music: {
              ...value.channels.music!,
              data: {
                ...music,
                waveform: hasWaveform
                  ? music.waveform
                  : undefined,
              },
            },
          },
        }}
        isConnected
        onAction={async () => undefined}
      />
    </main>
  )
  const mounted = render(content(false))
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Open full music player and queue",
    }),
  )
  const slider = await screen.findByRole("slider", {
    name: "Seek",
  })
  expect(slider).toHaveClass("is-plain")
  expect(
    slider.querySelector(".music-seek-handle"),
  ).not.toBeNull()
  mounted.rerender(content(true))
  await waitFor(() => {
    expect(
      slider.querySelectorAll("i").length,
    ).toBeGreaterThan(20)
    expect(
      [...slider.querySelectorAll("i")].some(
        (bar) => bar.getBoundingClientRect().height > 3,
      ),
    ).toBe(true)
  })
})
