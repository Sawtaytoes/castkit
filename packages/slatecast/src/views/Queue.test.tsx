import type { ViewDataState } from "@castkit/shared/protocol/ws"
import {
  screen,
  waitFor,
  within,
} from "@testing-library/preact"
import { describe, expect, test } from "vitest"
import {
  buildQueue,
  buildSnapshot,
} from "../__fixtures__/buildSnapshot.ts"
import { mountSlatecast } from "../__tests__/setup/mountSlatecast.tsx"

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
