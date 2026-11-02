import {
  fireEvent,
  render,
  waitFor,
} from "@testing-library/preact"
import { expect, test, vi } from "vitest"
import { DisplayPropertiesContext } from "./displayProperties.ts"
import { PriorityTimersView } from "./PriorityTimersView.tsx"
import "../styles.css"
import "./platform.css"

const now = Date.UTC(2026, 10, 1, 12)
const timers = [180, 30, 90].map((seconds) => ({
  id: `timer.${seconds}.r1`,
  domain: "timer",
  name: `Tea ${seconds}`,
  state: "active",
  attributes: {
    room: "lounge",
    finishes_at: new Date(
      now + seconds * 1000,
    ).toISOString(),
  },
  actions: ["pause", "cancel", "add_5_minutes"],
}))
test.each([
  200, 480, 1024,
])("priority timers fit %spx and send revision-checked actions", async (width) => {
  const onAction = vi.fn(async () => undefined)
  const result = render(
    <DisplayPropertiesContext.Provider
      value={{ repaint: "instant", hasTouch: true }}
    >
      <div
        style={{ width, height: width === 200 ? 200 : 480 }}
      >
        <PriorityTimersView
          data={{ entities: timers }}
          now={now}
          settings={{
            presentation: "priority",
            room: "lounge",
          }}
          isControlEnabled
          onAction={onAction}
        />
      </div>
    </DisplayPropertiesContext.Provider>,
  )
  await waitFor(() =>
    expect(
      result.container.querySelector("article h2")
        ?.textContent,
    ).toBe("Tea 30"),
  )
  await waitFor(() =>
    expect(
      result.container.querySelectorAll("article").length,
    ).toBe(width === 200 ? 1 : 3),
  )
  const first = result.container.querySelector("article")!
  expect(first.textContent).toContain("0:30")
  const bounds = first.getBoundingClientRect()
  first
    .querySelectorAll("h2,strong,button")
    .forEach((element) => {
      const rectangle = element.getBoundingClientRect()
      expect(rectangle.bottom).toBeLessThanOrEqual(
        bounds.bottom + 1,
      )
      expect(rectangle.right).toBeLessThanOrEqual(
        bounds.right + 1,
      )
    })
  fireEvent.click(
    result.getAllByRole("button", { name: "Pause" })[0]!,
  )
  await waitFor(() =>
    expect(onAction).toHaveBeenCalledWith("pause", {
      entityId: "timer.30.r1",
    }),
  )
  fireEvent.click(
    result.getAllByRole("button", { name: "Cancel" })[0]!,
  )
  await waitFor(() =>
    expect(onAction).toHaveBeenCalledWith("cancel", {
      entityId: "timer.30.r1",
    }),
  )
})

test("a long topic and paused timer stay inside a tiny card, and expiry promotes the next timer", async () => {
  const entities = [
    { ...timers[1]!, name: "Long timer topic ".repeat(8) },
    {
      ...timers[0]!,
      state: "paused",
      attributes: { room: "lounge", remaining: "0:05:00" },
      actions: ["start", "cancel"],
    },
  ]
  const content = (at: number) => (
    <DisplayPropertiesContext.Provider
      value={{ repaint: "fast", hasTouch: true }}
    >
      <div style={{ width: 200, height: 200 }}>
        <PriorityTimersView
          data={{ entities }}
          now={at}
          settings={{
            presentation: "priority",
            room: "lounge",
          }}
          isControlEnabled
          onAction={async () => undefined}
        />
      </div>
    </DisplayPropertiesContext.Provider>
  )
  const result = render(content(now))
  await waitFor(() =>
    expect(
      result.container.querySelectorAll("article").length,
    ).toBe(1),
  )
  expect(result.getByRole("timer").textContent).toBe(
    "~0:30",
  )
  const bounds = result.container
    .querySelector("article")
    ?.getBoundingClientRect()
  if (!bounds) throw new Error("Missing timer card")
  result.container
    .querySelectorAll("h2,strong,button")
    .forEach((element) => {
      expect(
        element.getBoundingClientRect().bottom,
      ).toBeLessThanOrEqual(bounds.bottom + 1)
    })
  result.rerender(content(now + 31_000))
  await waitFor(() =>
    expect(
      result.getByRole("button", { name: "Resume" }),
    ).toBeVisible(),
  )
  expect(result.getByText("Paused")).toBeVisible()
})
