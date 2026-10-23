import { render, screen } from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { useState } from "preact/hooks"
import { expect, test, vi } from "vitest"
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
test("scanned people stay visible and every queue is reachable in complete rows", async () => {
  const onAction = setup()
  expect(
    screen.getByRole("button", { name: "Remove Ada" }),
  ).toBeVisible()
  await expect
    .poll(
      () =>
        screen.queryAllByRole("button", { name: /Movies/ })
          .length,
    )
    .toBeGreaterThan(0)
  const buttons = screen.getAllByRole("button", {
    name: /Movies/,
  })
  buttons.forEach((button) => {
    const bounds = button.getBoundingClientRect()
    const parent =
      button.parentElement?.getBoundingClientRect()
    if (!parent) throw new Error("Missing queue list")
    expect(bounds.bottom).toBeLessThanOrEqual(
      parent.bottom + 1,
    )
  })
  const user = userEvent.setup()
  await user.click(
    screen.getByRole("button", { name: "Next queues" }),
  )
  expect(onAction).toHaveBeenCalledWith(
    "touch",
    expect.objectContaining({ sessionId: "session-one" }),
  )
  const next = screen.getAllByRole("button", {
    name: /Movies/,
  })[0]!
  expect(next.textContent).not.toBe(buttons[0]?.textContent)
  await user.click(next)
  expect(onAction).toHaveBeenCalledWith(
    "choose",
    expect.objectContaining({
      revision: "selection-one",
      queueId: expect.any(String),
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
