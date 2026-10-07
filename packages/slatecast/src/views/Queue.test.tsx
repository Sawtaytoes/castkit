import type { ViewDataState } from "@castkit/shared/protocol/ws"
import {
  screen,
  waitFor,
  within,
} from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { describe, expect, test } from "vitest"
import {
  buildDeviceProfile,
  buildNowPlaying,
  buildQueue,
  buildSnapshot,
} from "../__fixtures__/buildSnapshot.ts"
import { mountSlatecast } from "../__tests__/setup/mountSlatecast.tsx"
import { waitUntil } from "../__tests__/setup/slatecastServer.ts"

const mountQueueView = async (data: ViewDataState) =>
  mountSlatecast({
    snapshot: buildSnapshot({ view: "queue", data }),
  })

const queueItems = () => screen.getAllByRole("listitem")

describe("queue list", () => {
  test("renders every track with its artist and formatted duration", async () => {
    await mountQueueView({
      queue: buildQueue({
        items: [
          {
            title: "Roygbiv",
            artist: "Boards of Canada",
            durationSeconds: 151,
            isCurrent: true,
          },
          {
            title: "Olson",
            artist: "Boards of Canada",
            durationSeconds: 90,
            isCurrent: false,
          },
          {
            title: "Kaini Industries",
            artist: "Aphex Twin",
            isCurrent: false,
          },
        ],
      }),
    })

    const items = queueItems()
    expect(items).toHaveLength(3)
    expect(screen.getByText("Roygbiv")).toBeVisible()
    expect(screen.getByText("Olson")).toBeVisible()
    expect(
      screen.getByText("Kaini Industries"),
    ).toBeVisible()
    expect(
      screen.getAllByText("Boards of Canada"),
    ).toHaveLength(2)
    expect(screen.getByText("Aphex Twin")).toBeVisible()
    expect(screen.getByText("2:31")).toBeVisible()
    expect(screen.getByText("1:30")).toBeVisible()
  })

  test("omits the duration for a track whose length is unknown", async () => {
    await mountQueueView({
      queue: buildQueue({
        items: [
          {
            title: "Kaini Industries",
            artist: "Aphex Twin",
            isCurrent: true,
          },
        ],
      }),
    })

    const [item] = queueItems()
    expect(
      within(item).queryByText(/^\d+:\d{2}$/),
    ).toBeNull()
  })

  test("marks the current track and leaves the rest unmarked", async () => {
    const { view } = await mountQueueView({
      queue: buildQueue(),
    })

    const [current, upcoming] = queueItems()
    expect(
      within(current).getByText("Roygbiv"),
    ).toBeVisible()
    expect(current.className).toBe("current")
    expect(
      within(upcoming).getByText("Olson"),
    ).toBeVisible()
    expect(upcoming.className).toBe("")
    expect(
      view.container.querySelectorAll("li.current"),
    ).toHaveLength(1)
  })

  test("exposes the current track to assistive tech, not just visually", async () => {
    const { view } = await mountQueueView({
      queue: buildQueue(),
    })

    const [current, upcoming] = queueItems()
    expect(current).toHaveAttribute("aria-current", "true")
    // Absent rather than "false" — an unmarked row shouldn't be announced.
    expect(upcoming).not.toHaveAttribute("aria-current")
    expect(
      view.container.querySelectorAll("[aria-current]"),
    ).toHaveLength(1)
  })
})

describe("queue empty state", () => {
  test("falls back to the empty message when the queue has no items", async () => {
    await mountQueueView({
      queue: buildQueue({ items: [] }),
    })

    expect(screen.getByText("Queue is empty")).toBeVisible()
    expect(screen.queryByRole("listitem")).toBeNull()
  })

  test("falls back to the empty message before any queue has been pushed", async () => {
    await mountQueueView({})

    expect(screen.getByText("Queue is empty")).toBeVisible()
  })
})

describe("queue updates", () => {
  test("replaces the list when the server pushes a new queue", async () => {
    const { server } = await mountQueueView({
      queue: buildQueue(),
    })
    expect(screen.getByText("Roygbiv")).toBeVisible()

    server.push({
      type: "queue",
      data: buildQueue({
        items: [
          {
            title: "Dayvan Cowboy",
            artist: "Boards of Canada",
            durationSeconds: 302,
            isCurrent: true,
          },
        ],
      }),
    })

    await waitFor(() => {
      expect(
        screen.getByText("Dayvan Cowboy"),
      ).toBeVisible()
    })
    expect(screen.queryByText("Roygbiv")).toBeNull()
    expect(screen.getByText("5:02")).toBeVisible()
    expect(queueItems()).toHaveLength(1)
  })

  test("returns to the empty message when the queue is cleared", async () => {
    const { server } = await mountQueueView({
      queue: buildQueue(),
    })

    server.push({
      type: "queue",
      data: buildQueue({ items: [] }),
    })

    await waitFor(() => {
      expect(
        screen.getByText("Queue is empty"),
      ).toBeVisible()
    })
    expect(screen.queryByRole("listitem")).toBeNull()
  })
})

test("print queue uses its own feed and never shows music or print controls", async () => {
  await mountSlatecast({
    snapshot: buildSnapshot({
      view: "print-queue",
      data: {
        queue: buildQueue(),
        printQueue: {
          items: [
            {
              title: "Storage tray",
              artist: "Printer · Manual start",
              durationSeconds: 5400,
              isCurrent: false,
            },
          ],
        },
      },
    }),
  })
  expect(screen.getByText("Storage tray")).toBeVisible()
  expect(
    screen.getByText("Printer · Manual start"),
  ).toBeVisible()
  expect(screen.queryByText("Roygbiv")).toBeNull()
  const queue = document.querySelector(".queue")
  expect(queue).not.toBeNull()
  expect(
    within(queue as HTMLElement).queryByRole("button"),
  ).toBeNull()
})

describe("audio queue controls", () => {
  test("clicking the upcoming row plays the next track through the socket", async () => {
    const { server } = await mountQueueView({
      queue: buildQueue(),
      nowPlaying: buildNowPlaying(),
    })
    await userEvent.click(
      screen.getByRole("button", { name: "Play Olson" }),
    )
    await waitUntil(() => server.commands.length === 1)
    expect(server.commands).toEqual([{ action: "next" }])
  })

  test("keyboard activation resumes a stopped current track without clearing the queue", async () => {
    const { server } = await mountQueueView({
      queue: buildQueue(),
      nowPlaying: buildNowPlaying({ isPlaying: false }),
    })
    screen
      .getByRole("button", { name: "Resume Roygbiv" })
      .focus()
    await userEvent.keyboard("{Enter}")
    await waitUntil(() => server.commands.length === 1)
    expect(server.commands).toEqual([
      { action: "play_pause" },
    ])
  })

  test("the playing row cannot accidentally pause playback", async () => {
    const { server } = await mountQueueView({
      queue: buildQueue(),
      nowPlaying: buildNowPlaying(),
    })
    const current = screen.getByRole("button", {
      name: "Playing Roygbiv",
    })
    expect(current).toBeDisabled()
    await userEvent.click(current)
    expect(server.commands).toEqual([])
  })

  test("a view swipe does not also activate a queue row", async () => {
    const { server } = await mountQueueView({
      queue: buildQueue(),
    })
    const upcoming = screen.getByRole("button", {
      name: "Play Olson",
    })
    const user = userEvent.setup()
    await user.pointer([
      {
        target: upcoming,
        keys: "[MouseLeft>]",
        coords: { clientX: 100, clientY: 100 },
      },
      {
        target: upcoming,
        coords: { clientX: 100, clientY: 180 },
      },
      {
        target: upcoming,
        keys: "[/MouseLeft]",
        coords: { clientX: 100, clientY: 180 },
      },
    ])
    await waitUntil(() => server.commands.length === 1)
    expect(server.commands).toEqual([
      { action: "view", value: "now-playing" },
    ])
  })

  test("touchless panels stay passive", async () => {
    await mountSlatecast({
      snapshot: buildSnapshot({
        view: "queue",
        device: buildDeviceProfile({ hasTouch: false }),
        data: { queue: buildQueue() },
      }),
    })
    expect(
      within(
        screen.getByRole("list", { name: "Audio queue" }),
      ).queryByRole("button"),
    ).toBeNull()
  })

  test("missing current position does not guess which track a next command would play", async () => {
    await mountQueueView({
      queue: buildQueue({
        items: [
          {
            title: "Olson",
            artist: "Boards of Canada",
            isCurrent: false,
          },
        ],
      }),
    })
    expect(
      within(
        screen.getByRole("list", { name: "Audio queue" }),
      ).queryByRole("button"),
    ).toBeNull()
  })
})
