import {
  render,
  screen,
  waitFor,
} from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "preact"
import { expect, test, vi } from "vitest"
import { page } from "vitest/browser"
import { buildMusicPlayer } from "../__fixtures__/buildMusicPlayer.ts"
import { MusicPlayer } from "./MusicPlayer.tsx"
import "../styles.css"

const NOW_MS = Date.now()

/** Render at the 1024 x 600 display the layout was drawn for. */
const renderPlayer = async (
  props: Partial<ComponentProps<typeof MusicPlayer>> = {},
) => {
  await page.viewport(1024, 600)
  const onAction = vi.fn(async () => undefined)
  render(
    <div
      style={{
        position: "relative",
        width: "1024px",
        height: "600px",
      }}
    >
      <MusicPlayer
        data={buildMusicPlayer({ nowMs: NOW_MS })}
        layout="side-by-side"
        isLyricsTabVisible
        playedRowCount={2}
        isControlEnabled
        onAction={onAction}
        {...props}
      />
    </div>,
  )
  return { onAction, user: userEvent.setup() }
}

test("shows the played, current, and upcoming rows and only rows that fit", async () => {
  await renderPlayer()
  expect(screen.getByText("Played")).toBeVisible()
  expect(screen.getByText("Now playing")).toBeVisible()
  expect(screen.getByText("Up next")).toBeVisible()
  const rows = screen
    .getAllByRole("button")
    .filter((button) =>
      button.classList.contains("music-row"),
    )
  const played = rows.filter((row) =>
    row.classList.contains("is-played"),
  )
  expect(played).toHaveLength(2)
  const current = screen.getByRole("button", {
    current: true,
  })
  expect(current).toBeDisabled()
  expect(current).toHaveTextContent("Small Hours")
  const queue = document.querySelector(".music-queue")
  const queueBottom =
    queue?.getBoundingClientRect().bottom ?? 0
  rows.forEach((row) => {
    expect(
      row.getBoundingClientRect().bottom,
    ).toBeLessThanOrEqual(queueBottom + 0.5)
  })
  expect(rows.length).toBeGreaterThanOrEqual(10)
})

test("plays a queued row by its queue item id", async () => {
  const { onAction, user } = await renderPlayer()
  await user.click(
    screen.getByRole("button", { name: /Echo Park/ }),
  )
  expect(onAction).toHaveBeenCalledWith("play_item", {
    queueItemId: "row-13",
  })
})

test("sends transport, shuffle, repeat, and favorite actions", async () => {
  const { onAction, user } = await renderPlayer()
  await user.click(
    screen.getByRole("button", { name: "Pause" }),
  )
  await user.click(
    screen.getByRole("button", { name: "Next track" }),
  )
  await user.click(
    screen.getByRole("button", { name: "Shuffle" }),
  )
  await user.click(
    screen.getByRole("button", { name: "Repeat all" }),
  )
  await user.click(
    screen.getByRole("button", {
      name: "Remove from favorites",
    }),
  )
  expect(onAction.mock.calls).toEqual([
    ["play_pause", undefined],
    ["next", undefined],
    ["shuffle", { isEnabled: true }],
    ["repeat", { mode: "one" }],
    ["favorite", { isFavorite: false }],
  ])
})

test("seeks to the point selected on the waveform", async () => {
  const { onAction } = await renderPlayer()
  const wave = screen.getByRole("slider", { name: "Seek" })
  const box = wave.getBoundingClientRect()
  wave.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      clientX: box.left + box.width / 2,
      clientY: box.top + box.height / 2,
    }),
  )
  const duration = buildMusicPlayer({ nowMs: NOW_MS })
    .current?.durationSeconds
  expect(onAction).toHaveBeenCalledWith("seek", {
    positionSeconds: Math.round((duration ?? 0) / 2),
  })
  expect(wave.querySelectorAll("i").length).toBeGreaterThan(
    80,
  )
})

test("lyrics follow the position and a line seeks to its time", async () => {
  const { onAction, user } = await renderPlayer()
  await user.click(
    screen.getByRole("tab", { name: "Lyrics" }),
  )
  const sung = screen.getByRole("button", {
    name: "This is the line being sung right now",
  })
  await waitFor(() =>
    expect(sung).toHaveClass("is-current"),
  )
  await user.click(
    screen.getByRole("button", {
      name: "And this one waits for its turn",
    }),
  )
  expect(onAction).toHaveBeenCalledWith("seek", {
    positionSeconds: 25,
  })
})

test("the Lyrics tab is disabled for a track without lyrics", async () => {
  await renderPlayer({
    data: buildMusicPlayer({
      nowMs: NOW_MS,
      overrides: { lyrics: undefined },
    }),
  })
  expect(
    screen.getByRole("tab", { name: "Lyrics" }),
  ).toBeDisabled()
})

test("picks another player and syncs a speaker from the player menu", async () => {
  const { onAction, user } = await renderPlayer()
  await user.click(
    screen.getByRole("button", { name: /Desk Speakers/ }),
  )
  await user.click(
    screen.getByRole("menuitemcheckbox", {
      name: /Shelf Speaker/,
    }),
  )
  expect(onAction).toHaveBeenCalledWith("set_member", {
    playerId: "shelf",
    isMember: true,
  })
  expect(
    screen.getByRole("menuitemcheckbox", {
      name: /Porch Speaker/,
    }),
  ).toBeDisabled()
  await user.click(
    screen.getByRole("menuitemradio", {
      name: /Desk Left/,
    }),
  )
  expect(onAction).toHaveBeenCalledWith("select_player", {
    playerId: "desk-left",
  })
})

test("sets the volume when the slider is released", async () => {
  const { onAction } = await renderPlayer()
  const slider = screen.getByRole("slider", {
    name: "Volume",
  })
  ;(slider as HTMLInputElement).value = "70"
  slider.dispatchEvent(
    new Event("input", { bubbles: true }),
  )
  slider.dispatchEvent(
    new Event("change", { bubbles: true }),
  )
  expect(onAction).toHaveBeenCalledWith("set_volume", {
    volume: 70,
  })
})

test("a read-only view disables every control", async () => {
  await renderPlayer({ isControlEnabled: false })
  expect(
    screen.getByRole("button", { name: "Pause" }),
  ).toBeDisabled()
  expect(
    screen.getByRole("button", { name: /Echo Park/ }),
  ).toBeDisabled()
  expect(
    screen.getByRole("slider", { name: "Volume" }),
  ).toBeDisabled()
})

test("shows a refused action and keeps the player usable", async () => {
  const { user } = await renderPlayer({
    onAction: async () => {
      throw new Error("Music Assistant is not connected.")
    },
  })
  await user.click(
    screen.getByRole("button", { name: "Next track" }),
  )
  expect(
    await screen.findByRole("alert"),
  ).toHaveTextContent("Music Assistant is not connected.")
})

test("the wide-waveform layout puts the queue below the controls", async () => {
  await renderPlayer({ layout: "wide-waveform" })
  const controls = screen
    .getByRole("button", { name: "Pause" })
    .getBoundingClientRect()
  const queue = document
    .querySelector(".music-queue")
    ?.getBoundingClientRect()
  expect(queue?.top ?? 0).toBeGreaterThan(controls.bottom)
  expect(queue?.width ?? 0).toBeGreaterThan(1000)
})

test("artwork that fails to load shows the note instead of a broken image", async () => {
  const data = buildMusicPlayer({ nowMs: NOW_MS })
  await renderPlayer({
    data: {
      ...data,
      ...(data.current
        ? {
            current: {
              ...data.current,
              artworkPath: "/missing-artwork.jpg",
            },
          }
        : {}),
    },
  })
  await waitFor(() =>
    expect(
      document.querySelector(
        ".music-main .music-art-empty",
      ),
    ).not.toBeNull(),
  )
  expect(
    document.querySelector(".music-main img.music-art"),
  ).toBeNull()
})
