import {
  fireEvent,
  render,
  screen,
} from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { useState } from "preact/hooks"
import { expect, test, vi } from "vitest"
import adaAvatar from "../../../../e2e/__fixtures__/avatars/ada.jpg"
import graceAvatar from "../../../../e2e/__fixtures__/avatars/grace.jpg"
import { QueuePicker } from "./QueuePicker.tsx"
import "../styles.css"
import "./platform.css"

const data = {
  sessionId: "session-one",
  revision: "selection-one",
  isActive: true,
  expiresAt: 200_000,
  people: [
    { id: "ada", name: "Ada" },
    { id: "grace", name: "Grace" },
  ],
  queues: Array.from({ length: 12 }, (_, index) => ({
    id: `queue-${index}`,
    title: `Movies ${index + 1}`,
  })),
}
const setup = (isControlEnabled = true, now = 100_000) => {
  const onAction = vi.fn(async () => undefined)
  render(
    <div style={{ width: 480, height: 400 }}>
      <QueuePicker
        data={data}
        now={now}
        isControlEnabled={isControlEnabled}
        onAction={onAction}
      />
    </div>,
  )
  return onAction
}
test("avatar-only header and scrolling reach every queue without paging", async () => {
  const onAction = setup()
  expect(screen.queryByText("Choose a queue")).toBeNull()
  expect(screen.queryByText("Ada")).toBeNull()
  const group = screen.getByRole("group", {
    name: "Queues",
  })
  expect(group).toHaveAttribute(
    "data-castkit-scroll",
    "true",
  )
  expect(group.scrollHeight).toBeGreaterThan(
    group.clientHeight,
  )
  const last = screen.getByRole("button", {
    name: "Movies 12",
    exact: true,
  })
  group.scrollTop = group.scrollHeight
  expect(
    last.getBoundingClientRect().bottom,
  ).toBeLessThanOrEqual(
    group.getBoundingClientRect().bottom + 1,
  )
  await userEvent.setup().click(last)
  expect(onAction).toHaveBeenCalledWith(
    "choose",
    expect.objectContaining({
      queueId: "queue-11",
      revision: "selection-one",
    }),
  )
})
test("removal, reset and close carry the selection identity", async () => {
  const onAction = setup()
  const user = userEvent.setup()
  await user.click(
    screen.getByRole("button", { name: "Remove Grace" }),
  )
  expect(onAction).toHaveBeenCalledWith("remove", {
    personId: "grace",
    sessionId: "session-one",
    revision: "selection-one",
  })
  await user.click(
    screen.getByRole("button", { name: "Reset" }),
  )
  expect(onAction).toHaveBeenCalledWith(
    "reset",
    expect.objectContaining({ sessionId: "session-one" }),
  )
  await user.click(
    screen.getByRole("button", { name: "Close" }),
  )
  expect(onAction).toHaveBeenCalledWith(
    "dismiss",
    expect.objectContaining({ sessionId: "session-one" }),
  )
})
test("expired and read-only views cannot select playback", async () => {
  const onAction = setup(false)
  expect(
    screen.getByRole("button", { name: "Remove Ada" }),
  ).toBeDisabled()
  expect(onAction).not.toHaveBeenCalled()
})
test("expired data cannot leave stale queues actionable", () => {
  const onAction = setup(true, 200_001)
  expect(
    screen.queryByRole("button", { name: /Movies/ }),
  ).toBeNull()
  expect(
    screen.getByText("Scan a person card to begin."),
  ).toBeVisible()
  expect(onAction).not.toHaveBeenCalled()
})

test.each([
  ["Remove Ada", "remove"],
  ["Movies 1", "choose"],
  ["Reset", "reset"],
  ["Close", "dismiss"],
])("the first tap on %s survives the display action lock", async (name, action) => {
  const onAction = vi.fn()
  const Harness = () => {
    const [isPending, setIsPending] = useState(false)
    return (
      <div style={{ width: 480, height: 480 }}>
        <QueuePicker
          data={data}
          now={100_000}
          isControlEnabled={!isPending}
          onAction={async (requested, payload) => {
            setIsPending(true)
            onAction(requested, payload)
          }}
        />
      </div>
    )
  }
  render(<Harness />)
  const user = userEvent.setup()
  const button = screen.getByRole("button", {
    name,
    exact: name !== "Movies 1",
  })
  await user.pointer([
    { target: button, keys: "[MouseLeft>]" },
    { keys: "[/MouseLeft]" },
  ])
  expect(onAction).toHaveBeenCalledExactlyOnceWith(
    action,
    expect.objectContaining({ sessionId: "session-one" }),
  )
})

test.each([
  [480, 480, 6],
  [384, 480, 4],
  [480, 320, 3],
])("%s by %s panels show at least %s complete choices", (width, height, count) => {
  render(
    <div style={{ width, height }}>
      <QueuePicker
        data={data}
        now={100_000}
        isControlEnabled
        onAction={async () => undefined}
      />
    </div>,
  )
  const group = screen.getByRole("group", {
    name: "Queues",
  })
  const bounds = group.getBoundingClientRect()
  const complete = screen
    .getAllByRole("button", { name: /Movies/ })
    .filter((button) => {
      const row = button.getBoundingClientRect()
      return (
        row.top >= bounds.top &&
        row.bottom <= bounds.bottom + 1
      )
    })
  expect(complete.length).toBeGreaterThanOrEqual(count)
  expect(
    screen
      .getByRole("button", { name: "Reset" })
      .getBoundingClientRect().bottom,
  ).toBeLessThanOrEqual(height)
  expect(
    screen
      .getByRole("button", { name: "Close" })
      .getBoundingClientRect().bottom,
  ).toBeLessThanOrEqual(height)
})

test("photos fall back to initials after failure and retry a replacement URL", async () => {
  const props = {
    data: {
      ...data,
      people: [
        { id: "ada", name: "Ada", artworkPath: adaAvatar },
      ],
    },
    now: 100_000,
    isControlEnabled: true,
    onAction: async () => undefined,
  }
  const view = render(<QueuePicker {...props} />)
  const avatar = () =>
    view.container.querySelector(".queue-picker-avatar")!
  await expect
    .poll(
      () =>
        (
          avatar().querySelector(
            "img",
          ) as HTMLImageElement | null
        )?.naturalWidth ?? 0,
    )
    .toBeGreaterThan(0)
  fireEvent.error(avatar().querySelector("img")!)
  expect(avatar().textContent).toBe("A")
  view.rerender(
    <QueuePicker
      {...props}
      data={{
        ...props.data,
        people: [
          {
            id: "ada",
            name: "Ada",
            artworkPath: graceAvatar,
          },
        ],
      }}
    />,
  )
  await expect
    .poll(
      () =>
        (
          avatar().querySelector(
            "img",
          ) as HTMLImageElement | null
        )?.naturalWidth ?? 0,
    )
    .toBeGreaterThan(0)
})

test("additional selected people scroll within the avatar row without shrinking queue choices", async () => {
  const people = [
    "Ada Lovelace",
    "Grace Hopper",
    "Linus",
    "Sven",
    "Elena",
    "Robin",
    "Sam",
    "Max",
  ].map((name) => ({ id: name, name }))
  render(
    <div style={{ width: 480, height: 480 }}>
      <QueuePicker
        data={{ ...data, people }}
        now={100_000}
        isControlEnabled
        onAction={async () => undefined}
      />
    </div>,
  )
  await expect
    .poll(
      () =>
        screen.getAllByRole("button", { name: /Movies/ })
          .length,
    )
    .toBe(12)
  const group = screen.getByRole("group", {
    name: "Selected people",
  })
  expect(group).toHaveAttribute("data-castkit-scroll")
  expect(group.scrollHeight).toBeGreaterThan(
    group.clientHeight,
  )
  group.scrollTop = group.scrollHeight
  const last = screen
    .getByRole("button", { name: "Remove Max" })
    .getBoundingClientRect()
  const bounds = group.getBoundingClientRect()
  expect(last.bottom).toBeLessThanOrEqual(bounds.bottom + 1)
  const footer = screen
    .getByRole("button", { name: "Reset" })
    .getBoundingClientRect()
  expect(footer.bottom).toBeLessThanOrEqual(480)
})

test("a source load error does not also claim that no queues match", () => {
  render(
    <div style={{ width: 480, height: 480 }}>
      <QueuePicker
        data={{
          ...data,
          queues: [],
          message:
            "Queues could not be loaded. Scan again to retry.",
        }}
        now={100_000}
        isControlEnabled
        onAction={async () => undefined}
      />
    </div>,
  )
  expect(screen.getByRole("status")).toHaveTextContent(
    "Queues could not be loaded",
  )
  expect(
    screen.queryByText(/No matching queues/),
  ).toBeNull()
})

test("a native scroll cancellation renews activity without removing a person, while capture scrolling does not", () => {
  const onAction = setup()
  const group = screen.getByRole("group", {
    name: "Selected people",
  })
  group.scrollTop = 10
  fireEvent.scroll(group)
  expect(onAction).not.toHaveBeenCalled()
  fireEvent.pointerCancel(
    screen.getByRole("button", { name: "Remove Ada" }),
  )
  expect(onAction).toHaveBeenCalledExactlyOnceWith(
    "touch",
    expect.objectContaining({ sessionId: "session-one" }),
  )
})

test("scroll gestures on the queue list renew activity without choosing playback", () => {
  const onAction = setup()
  const group = screen.getByRole("group", {
    name: "Queues",
  })
  fireEvent.scroll(group)
  expect(onAction).not.toHaveBeenCalled()
  fireEvent.pointerCancel(group)
  expect(onAction).toHaveBeenCalledExactlyOnceWith(
    "touch",
    expect.objectContaining({ sessionId: "session-one" }),
  )
})

test("poster failure keeps the entire enlarged queue actionable", async () => {
  const onAction = vi.fn(async () => undefined)
  render(
    <div style={{ width: 480, height: 480 }}>
      <QueuePicker
        data={{
          ...data,
          queues: [
            {
              id: "learning",
              title: "Educational Shows",
              artworkPath: adaAvatar,
            },
          ],
        }}
        now={100_000}
        isControlEnabled
        onAction={onAction}
      />
    </div>,
  )
  const tile = screen.getByRole("button", {
    name: "Educational Shows",
  })
  const image = tile.querySelector("img")
  if (!image) throw new Error("Missing poster")
  fireEvent.error(image)
  expect(tile.querySelector("img")).toBeNull()
  const bounds = tile.getBoundingClientRect()
  expect(bounds.width).toBeGreaterThan(240)
  expect(bounds.height).toBeGreaterThan(250)
  await userEvent.setup().click(tile)
  expect(onAction).toHaveBeenCalledExactlyOnceWith(
    "choose",
    expect.objectContaining({ queueId: "learning" }),
  )
})

test.each([
  2, 3, 4,
])("all %s queue choices fit the available panel without scrolling", async (count) => {
  render(
    <div style={{ width: 480, height: 480 }}>
      <QueuePicker
        data={{
          ...data,
          queues: data.queues.slice(0, count),
        }}
        now={100_000}
        isControlEnabled
        onAction={async () => undefined}
      />
    </div>,
  )
  const list = screen.getByRole("group", { name: "Queues" })
  await expect
    .poll(() => list.clientHeight)
    .toBeGreaterThan(300)
  await expect
    .poll(() => list.scrollHeight)
    .toBeLessThanOrEqual(list.clientHeight + 1)
  const bounds = list.getBoundingClientRect()
  screen
    .getAllByRole("button", { name: /Movies/ })
    .forEach((button) => {
      const tile = button.getBoundingClientRect()
      expect(tile.top).toBeGreaterThanOrEqual(bounds.top)
      expect(tile.bottom).toBeLessThanOrEqual(
        bounds.bottom + 1,
      )
      expect(tile.width).toBeGreaterThan(110)
    })
})
