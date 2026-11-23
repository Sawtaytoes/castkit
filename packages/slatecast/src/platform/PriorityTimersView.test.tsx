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
import { defined } from "@castkit/sdk/defined"

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
  const first = defined(
    result.container.querySelector("article"),
  )
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
    defined(
      result.getAllByRole("button", { name: "Pause" })[0],
    ),
  )
  await waitFor(() =>
    expect(onAction).toHaveBeenCalledWith("pause", {
      entityId: "timer.30.r1",
    }),
  )
  fireEvent.click(
    defined(
      result.getAllByRole("button", { name: "Cancel" })[0],
    ),
  )
  await waitFor(() =>
    expect(onAction).toHaveBeenCalledWith("cancel", {
      entityId: "timer.30.r1",
    }),
  )
})

test("a long topic and paused timer stay inside a tiny card, and expiry promotes the next timer", async () => {
  const entities = [
    {
      ...defined(timers[1]),
      name: "Long timer topic ".repeat(8),
    },
    {
      ...defined(timers[0]),
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
  expect(result.getByRole("timer").textContent).toBe("0:30")
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

test("a cancelled timer keeps its place as an Undo card until its window closes", async () => {
  const onAction = vi.fn(async () => undefined)
  const entities = [
    {
      id: "timer.a.r2",
      domain: "timer",
      name: "Laundry · Lounge",
      state: "canceling",
      attributes: {
        room: "lounge",
        label: "Laundry",
        duration: "0:10:00",
        finishes_at: new Date(now + 60_000).toISOString(),
        cancels_at: new Date(now + 21_000).toISOString(),
      },
      actions: ["undo_cancel"],
    },
    {
      id: "timer.b.r1",
      domain: "timer",
      name: "Bus · Everywhere",
      state: "active",
      attributes: {
        room: "everywhere",
        label: "Bus",
        kind: "end_time",
        duration: "0:30:00",
        finishes_at: new Date(now + 900_000).toISOString(),
      },
      actions: ["cancel", "add_5_minutes"],
    },
  ]
  const content = (at: number) => (
    <DisplayPropertiesContext.Provider
      value={{ repaint: "fast", hasTouch: true }}
    >
      <div style={{ width: 480, height: 480 }}>
        <PriorityTimersView
          data={{ entities }}
          now={at}
          settings={{ presentation: "priority" }}
          isControlEnabled
          onAction={onAction}
        />
      </div>
    </DisplayPropertiesContext.Provider>
  )
  const result = render(content(now))
  await waitFor(() =>
    expect(
      result.container.querySelectorAll("article").length,
    ).toBe(2),
  )
  const [first, second] = [
    ...result.container.querySelectorAll("article"),
  ]
  expect(first?.textContent).toContain("Cancelled")
  expect(first?.textContent).toContain("Gone in 30 seconds")
  expect(second?.querySelector("h2")?.textContent).toBe(
    "Bus",
  )
  expect(second?.textContent).toContain("Everywhere")
  expect(
    result.queryByRole("button", { name: "Pause" }),
  ).toBeNull()
  expect(
    result.queryByRole("button", { name: "Cancel" }),
  ).toBeVisible()
  fireEvent.click(
    result.getByRole("button", {
      name: "Undo cancel of Laundry",
    }),
  )
  await waitFor(() =>
    expect(onAction).toHaveBeenCalledWith("undo_cancel", {
      entityId: "timer.a.r2",
    }),
  )
  result.rerender(content(now + 22_000))
  await waitFor(() =>
    expect(
      result.container.querySelectorAll("article").length,
    ).toBe(1),
  )
})

test("a paused timer shows its room, and an Undo card moves no other card", async () => {
  const card = (
    id: string,
    label: string,
    state: string,
    finishesIn: number | null,
    actions: string[],
  ) => ({
    id,
    domain: "timer",
    name: `${label} · Lounge`,
    state,
    attributes: {
      room: "lounge",
      label,
      duration: "0:30:00",
      remaining: "0:12:30",
      finishes_at:
        finishesIn === null
          ? null
          : new Date(now + finishesIn).toISOString(),
      ...(state === "canceling"
        ? {
            cancels_at: new Date(
              now + 30_000,
            ).toISOString(),
          }
        : {}),
    },
    actions,
  })
  const controls = [
    "pause",
    "start",
    "cancel",
    "add_5_minutes",
  ]
  const content = (entities: unknown[]) => (
    <DisplayPropertiesContext.Provider
      value={{ repaint: "fast", hasTouch: true }}
    >
      <div style={{ width: 438, height: 438 }}>
        <PriorityTimersView
          data={{ entities } as never}
          now={now}
          settings={{ presentation: "priority" }}
          isControlEnabled
          onAction={async () => undefined}
        />
      </div>
    </DisplayPropertiesContext.Provider>
  )
  const titles = (result: ReturnType<typeof render>) =>
    [
      ...result.container.querySelectorAll("article h2"),
    ].map((element) => element.textContent)
  const before = [
    card(
      "timer.tea.r1",
      "Tea",
      "active",
      300_000,
      controls,
    ),
    card(
      "timer.bus.r1",
      "Bus",
      "active",
      600_000,
      controls,
    ),
    card("timer.reading.r1", "Reading", "paused", null, [
      "start",
      "cancel",
      "add_5_minutes",
    ]),
  ]
  const result = render(content(before))
  await waitFor(() =>
    expect(titles(result)).toEqual([
      "Tea",
      "Bus",
      "Reading",
    ]),
  )
  const reading =
    result.container.querySelectorAll("article")[2]
  expect(reading?.textContent).toContain("Paused")
  expect(reading?.textContent).toContain("Lounge")
  // The paused timer is cancelled and still reports an old, early deadline.
  result.rerender(
    content([
      before[0],
      before[1],
      card(
        "timer.reading.r2",
        "Reading",
        "canceling",
        1_000,
        ["undo_cancel"],
      ),
    ]),
  )
  await waitFor(() =>
    expect(
      result.getByText("Gone in 30 seconds"),
    ).toBeVisible(),
  )
  expect(titles(result)).toEqual(["Tea", "Bus", "Reading"])
  // The first timer is cancelled and its deadline is cleared.
  result.rerender(
    content([
      card("timer.tea.r2", "Tea", "canceling", null, [
        "undo_cancel",
      ]),
      before[1],
      before[2],
    ]),
  )
  await waitFor(() =>
    expect(
      result.getByRole("button", {
        name: "Undo cancel of Tea",
      }),
    ).toBeVisible(),
  )
  expect(titles(result)).toEqual(["Tea", "Bus", "Reading"])
  // A short side card keeps its Undo countdown inside the card.
  result.rerender(
    content([
      before[0],
      card("timer.bus.r2", "Bus", "canceling", 600_000, [
        "undo_cancel",
      ]),
      before[2],
    ]),
  )
  await waitFor(() =>
    expect(
      result.getByText("Gone in 30 seconds"),
    ).toBeVisible(),
  )
  const bus =
    result.container.querySelectorAll("article")[1]
  const gone = result.getByText("Gone in 30 seconds")
  const box = bus?.getBoundingClientRect()
  if (!box) throw new Error("Missing Bus card")
  expect(box.height).toBeLessThan(230)
  expect(
    gone.getBoundingClientRect().bottom,
  ).toBeLessThanOrEqual(box.bottom)
})

test.each([
  { repaint: "instant", power: "wired", isDraining: true },
  {
    repaint: "instant",
    power: "battery",
    isDraining: true,
  },
  { repaint: "fast", power: "wired", isDraining: true },
  { repaint: "fast", power: "battery", isDraining: false },
  { repaint: "slow", power: "wired", isDraining: false },
  {
    repaint: "super-slow",
    power: "wired",
    isDraining: false,
  },
] as const)("the drain and the Undo countdown follow the progress freshness rule on a $repaint $power panel", async ({
  repaint,
  power,
  isDraining,
}) => {
  const half = {
    ...defined(timers[0]),
    attributes: {
      ...defined(timers[0]).attributes,
      duration: "0:06:00",
    },
  }
  const canceling = {
    ...defined(timers[2]),
    state: "canceling",
    attributes: {
      ...defined(timers[2]).attributes,
      cancels_at: new Date(now + 15_000).toISOString(),
    },
    actions: ["undo_cancel"],
  }
  const result = render(
    <DisplayPropertiesContext.Provider
      value={{ repaint, power, hasTouch: true }}
    >
      <div style={{ width: 480, height: 480 }}>
        <PriorityTimersView
          data={{ entities: [half, canceling] }}
          now={now}
          settings={{ presentation: "priority" }}
          isControlEnabled
          onAction={async () => undefined}
        />
      </div>
    </DisplayPropertiesContext.Provider>,
  )
  await waitFor(() =>
    expect(
      result.container.querySelectorAll("article").length,
    ).toBe(2),
  )
  const fill = defined(
    result.container.querySelector<HTMLElement>(
      ".timer-priority-fill",
    ),
  )
  expect(fill.style.height).toBe(
    isDraining ? "50%" : "100%",
  )
  expect(
    result.container.querySelector(
      ".timer-priority-undo-bar",
    ) !== null,
  ).toBe(isDraining)
  expect(
    result.queryByText(/^Gone in \d+ seconds$/) !== null,
  ).toBe(isDraining)
  expect(result.getByText("Cancelled")).toBeVisible()
  expect(
    result.getByRole("button", {
      name: /^Undo cancel of /,
    }),
  ).toBeVisible()
})
