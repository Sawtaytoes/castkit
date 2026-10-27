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
      screen.getByLabelText("Upcoming music").children,
    ).toHaveLength(3),
  )
  mounted.rerender(content(112))
  await waitFor(() =>
    expect(
      screen.queryByLabelText("Upcoming music"),
    ).toBeNull(),
  )
})

test("the desk player opens its full queue and Back restores the priority overview", async () => {
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
  await waitFor(() =>
    expect(
      screen.getByText("130", { exact: true }),
    ).toBeVisible(),
  )
})
