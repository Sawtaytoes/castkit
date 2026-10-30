import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { expect, onTestFinished, test, vi } from "vitest"
import { page } from "vitest/browser"
import { buildMusicPlayer } from "../__fixtures__/buildMusicPlayer.ts"
import {
  finishNavigation,
  showNavigationLoading,
} from "../navigationFeedback.ts"
import { pointsOverviewFixture } from "./__fixtures__/pointsOverview.ts"
import { DisplayComposition } from "./PlatformApp.tsx"
import type { DisplaySnapshot } from "./protocol.ts"
import "../styles.css"
import "./platform.css"
import "./idleDashboard.css"

const snapshot = (): DisplaySnapshot => {
  const base = pointsOverviewFixture({ hasMusic: true })
  return {
    ...base,
    view: {
      ...base.view,
      layout: "single",
      isActiveOnly: false,
      panels: [
        {
          id: "room",
          specId: "idle-dashboard",
          bindings: {
            data: "agenda",
            points: "points",
            music: "music",
          },
          settings: {
            hour12: true,
            timeZone: "America/Chicago",
          },
        },
      ],
    },
    panelActivity: { room: true },
    channels: {
      ...base.channels,
      agenda: {
        id: "agenda",
        type: "agenda.v1",
        status: "ready",
        data: { events: [] },
      },
    },
  }
}
const mount = (
  value: DisplaySnapshot,
  onAction = vi.fn(async () => undefined),
) =>
  render(
    <main class="platform" data-device="true">
      <DisplayComposition
        snapshot={value}
        isConnected
        onAction={onAction}
      />
    </main>,
  )
const exactTarget = async () => {
  const old = {
    width: window.innerWidth,
    height: window.innerHeight,
  }
  onTestFinished(() => page.viewport(old.width, old.height))
  await page.viewport(1024, 600)
}

test("room music uses agenda spare space and opens the full queue without shrinking the clock", async () => {
  await exactTarget()
  const value = snapshot()
  const onAction = vi.fn(async () => undefined)
  const mounted = mount(value, onAction)
  const opener = await screen.findByRole("button", {
    name: "Open full music player and queue",
  })
  await document.fonts.ready
  const time = mounted.container.querySelector(
    ".idle-dashboard-time",
  )
  if (!time) throw new Error("Missing room clock")
  expect(
    Number.parseFloat(getComputedStyle(time).fontSize),
  ).toBe(210)
  const before = time.getBoundingClientRect()
  await userEvent.click(
    screen.getByRole("button", {
      name: "Pause",
      exact: true,
    }),
  )
  expect(onAction).toHaveBeenCalledWith({
    panelId: "room",
    input: "music",
    action: "play_pause",
    payload: undefined,
  })
  await userEvent.click(opener)
  await waitFor(() =>
    expect(
      screen.getByRole("tab", {
        name: "Queue",
        exact: true,
      }),
    ).toBeVisible(),
  )
  expect(time).not.toBeVisible()
  expect(
    mounted.container.querySelector(".platform-layout"),
  ).toHaveAttribute("data-layout", "single")
  expect(
    mounted.container
      .querySelector(".platform-panel")
      ?.getBoundingClientRect().width,
  ).toBe(1024)
  expect(
    mounted.container
      .querySelector(".compact-music-detail")
      ?.getBoundingClientRect().width,
  ).toBeGreaterThan(900)
  await userEvent.click(
    screen.getByRole("button", {
      name: "Back to overview",
    }),
  )
  await waitFor(() => expect(time).toBeVisible())
  await waitFor(
    () =>
      expect(
        Math.abs(
          time.getBoundingClientRect().width - before.width,
        ),
      ).toBeLessThan(0.1),
    { timeout: 3000 },
  )
  expect(
    mounted.container.querySelectorAll(
      ".idle-dashboard-points article",
    ),
  ).toHaveLength(3)
  // Unmounting the non-expanded nested player must not release a child's focus.
  await userEvent.click(
    screen.getByRole("button", {
      name: "View Robin's tasks today",
    }),
  )
  await waitFor(() =>
    expect(screen.getByText("Today's tasks")).toBeVisible(),
  )
  await userEvent.click(
    screen.getByRole("button", {
      name: "Back to all children",
    }),
  )
  await waitFor(() =>
    expect(
      screen.getByRole("button", {
        name: "Open full music player and queue",
      }),
    ).toBeVisible(),
  )
})

test("the room queue yields to all visible agenda rows before the compact card disappears", async () => {
  await exactTarget()
  const value = snapshot()
  const mounted = mount(value)
  await screen.findByRole("button", {
    name: "Open full music player and queue",
  })
  const events = Array.from({ length: 3 }, (_, index) => ({
    startMs: Date.now() + index * 3600000,
    isAllDay: false,
    summary: `Appointment ${index + 1} with a long event name requiring two lines of room in the agenda`,
  }))
  mounted.rerender(
    <main class="platform" data-device="true">
      <DisplayComposition
        snapshot={{
          ...value,
          channels: {
            ...value.channels,
            agenda: {
              ...value.channels.agenda!,
              data: { events },
            },
          },
        }}
        isConnected
        onAction={async () => undefined}
      />
    </main>,
  )
  await waitFor(() =>
    expect(
      screen.queryByRole("button", {
        name: "Open full music player and queue",
      }),
    ).toBeNull(),
  )
  for (const event of events)
    expect(screen.getByText(event.summary)).toBeVisible()
  expect(
    getComputedStyle(
      mounted.container.querySelector(
        ".idle-dashboard-agenda",
      )!,
    ).paddingTop,
  ).toBe("22px")
  expect(
    getComputedStyle(
      mounted.container.querySelector(
        ".idle-dashboard-agenda h2",
      )!,
    ).fontSize,
  ).toBe("26px")
  const time = mounted.container.querySelector(
    ".idle-dashboard-time",
  )
  if (!time) throw new Error("Missing clock")
  expect(
    Number.parseFloat(getComputedStyle(time).fontSize),
  ).toBe(210)
})

test("optional-feed failure does not couple music controls to the agenda, and stale music disables them", async () => {
  await exactTarget()
  const value = snapshot()
  const onAction = vi.fn(async () => undefined)
  value.channels.agenda = {
    ...value.channels.agenda!,
    status: "error",
    error: "Fixture unavailable",
  }
  const mounted = mount(value, onAction)
  const pause = await screen.findByRole("button", {
    name: "Pause",
    exact: true,
  })
  expect(pause).toBeEnabled()
  await userEvent.click(pause)
  expect(onAction).toHaveBeenCalledWith({
    panelId: "room",
    input: "music",
    action: "play_pause",
    payload: undefined,
  })
  mounted.rerender(
    <main class="platform" data-device="true">
      <DisplayComposition
        snapshot={{
          ...value,
          channels: {
            ...value.channels,
            music: {
              ...value.channels.music!,
              status: "stale",
            },
          },
        }}
        isConnected
        onAction={onAction}
      />
    </main>,
  )
  expect(
    screen.getByRole("button", {
      name: "Pause",
      exact: true,
    }),
  ).toBeDisabled()
})

test("a return-to-time request closes nested music and idle retained metadata leaves the room overview", async () => {
  await exactTarget()
  onTestFinished(finishNavigation)
  const value = snapshot()
  const mounted = mount(value)
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Open full music player and queue",
    }),
  )
  await screen.findByRole("button", {
    name: "Back to overview",
  })
  showNavigationLoading({
    label: "Time",
    requestedView: "calendar",
  })
  await waitFor(() =>
    expect(
      screen.queryByRole("button", {
        name: "Back to overview",
      }),
    ).toBeNull(),
  )
  expect(
    mounted.container.querySelector(".idle-dashboard-time"),
  ).toBeVisible()
  const idle = buildMusicPlayer({
    nowMs: Date.now(),
    state: "idle",
  })
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "Date"],
  })
  onTestFinished(() => {
    vi.useRealTimers()
  })
  mounted.rerender(
    <main class="platform" data-device="true">
      <DisplayComposition
        snapshot={{
          ...value,
          channels: {
            ...value.channels,
            music: { ...value.channels.music!, data: idle },
          },
        }}
        isConnected
        onAction={async () => undefined}
      />
    </main>,
  )
  expect(
    screen.getByRole("button", {
      name: "Open full music player and queue",
    }),
  ).toBeVisible()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(59_000)
  })
  expect(
    screen.getByRole("button", {
      name: "Open full music player and queue",
    }),
  ).toBeVisible()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000)
  })
  vi.useRealTimers()
  await waitFor(() =>
    expect(
      screen.queryByRole("button", {
        name: "Open full music player and queue",
      }),
    ).toBeNull(),
  )
})

test("stale optional music stays inside its slot without shrinking the room clock", async () => {
  await exactTarget()
  const value = snapshot()
  value.channels.music = {
    ...value.channels.music!,
    status: "stale",
  }
  const mounted = mount(value)
  await screen.findByText("Music data is out of date")
  expect(
    screen.getByRole("button", {
      name: "Pause",
      exact: true,
    }),
  ).toBeDisabled()
  expect(
    mounted.container.querySelector(
      ".platform-source-status",
    ),
  ).toBeNull()
  expect(
    getComputedStyle(
      mounted.container.querySelector(
        ".idle-dashboard-time",
      )!,
    ).fontSize,
  ).toBe("210px")
})

test("stopping expanded music restores the room without stealing the next child's focus", async () => {
  await exactTarget()
  const value = snapshot()
  // The agenda is optional too; music must never be mistaken for agenda JSON.
  delete value.view.panels[0]?.bindings.data
  const mounted = mount(value)
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Open full music player and queue",
    }),
  )
  await screen.findByRole("button", {
    name: "Back to overview",
  })
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "Date"],
  })
  onTestFinished(() => {
    vi.useRealTimers()
  })
  mounted.rerender(
    <main class="platform" data-device="true">
      <DisplayComposition
        snapshot={{
          ...value,
          channels: {
            ...value.channels,
            music: {
              ...value.channels.music!,
              data: buildMusicPlayer({
                nowMs: Date.now(),
                state: "idle",
              }),
            },
          },
        }}
        isConnected
        onAction={async () => undefined}
      />
    </main>,
  )
  expect(
    screen.getByRole("button", {
      name: "Back to overview",
    }),
  ).toBeVisible()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(59_000)
  })
  expect(
    screen.getByRole("button", {
      name: "Back to overview",
    }),
  ).toBeVisible()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000)
  })
  vi.useRealTimers()
  await waitFor(() =>
    expect(
      screen.queryByRole("button", {
        name: "Back to overview",
      }),
    ).toBeNull(),
  )
  expect(
    mounted.container.querySelector(".idle-dashboard-time"),
  ).toBeVisible()
  expect(
    mounted.container.querySelector(".platform-layout"),
  ).toHaveAttribute("data-layout", "single")
  await userEvent.click(
    screen.getByRole("button", {
      name: "View Robin's tasks today",
    }),
  )
  await screen.findByText("Today's tasks")
})

test("opening a child while music is expanded has one navigation owner", async () => {
  await exactTarget()
  const mounted = mount(snapshot())
  const kid = await screen.findByRole("button", {
    name: "View Robin's tasks today",
  })
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Open full music player and queue",
    }),
  )
  await screen.findByRole("button", {
    name: "Back to overview",
  })
  // Exercise a queued event from before the points become hidden.
  fireEvent.click(kid)
  await screen.findByText("Today's tasks")
  await userEvent.click(
    screen.getByRole("button", {
      name: "Back to all children",
    }),
  )
  await screen.findByRole("button", {
    name: "Open full music player and queue",
  })
  expect(
    mounted.container.querySelector(".platform-layout"),
  ).toHaveAttribute("data-layout", "single")
})

test("paused room music expires once, survives idle reports, and gets a fresh minute after resuming", async () => {
  await exactTarget()
  const value = snapshot()
  const mounted = mount(value)
  const opener = () =>
    screen.queryByRole("button", {
      name: "Open full music player and queue",
    })
  await waitFor(() => expect(opener()).toBeVisible())
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "Date"],
  })
  onTestFinished(() => {
    vi.useRealTimers()
  })
  const update = async (
    state: "playing" | "paused" | "idle",
  ) => {
    await act(async () => {
      mounted.rerender(
        <main class="platform" data-device="true">
          <DisplayComposition
            snapshot={{
              ...value,
              channels: {
                ...value.channels,
                music: {
                  ...value.channels.music!,
                  data: buildMusicPlayer({
                    nowMs: Date.now(),
                    state,
                  }),
                },
              },
            }}
            isConnected
            onAction={async () => undefined}
          />
        </main>,
      )
    })
  }
  await update("paused")
  await act(async () => {
    await vi.advanceTimersByTimeAsync(40_000)
  })
  await update("idle")
  expect(opener()).toBeVisible()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20_000)
  })
  expect(opener()).toBeNull()
  await update("paused")
  expect(opener()).toBeNull()
  await update("playing")
  expect(opener()).toBeVisible()
  await update("paused")
  await act(async () => {
    await vi.advanceTimersByTimeAsync(59_000)
  })
  expect(opener()).toBeVisible()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000)
  })
  expect(opener()).toBeNull()
})
