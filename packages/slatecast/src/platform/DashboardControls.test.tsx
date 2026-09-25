import {
  render,
  screen,
  waitFor,
} from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { expect, test, vi } from "vitest"
import { BuiltinView } from "./BuiltinView.tsx"
import { DisplayPropertiesContext } from "./displayProperties.ts"
import { EntitiesView } from "./EntitiesView.tsx"
import {
  chartSamples,
  EntityChart,
} from "./EntityChart.tsx"
import { buildMapViewport } from "./LocationMap.tsx"

const helpers = {
  entities: [
    {
      id: "input_text.timer_name",
      name: "Timer label",
      state: "",
      domain: "input_text",
      attributes: {},
      actions: ["set_value"],
    },
    {
      id: "input_select.timer_room",
      name: "Room",
      state: "Office",
      domain: "input_select",
      attributes: { options: ["Office", "Studio"] },
      actions: ["select_option"],
    },
    {
      id: "input_button.timer_start",
      name: "Start timer",
      state: "unknown",
      domain: "input_button",
      attributes: {},
      actions: ["press"],
    },
  ],
}

test("timer helper controls send text and choice parameters through the bound source", async () => {
  const onAction = vi.fn(async () => undefined)
  render(
    <EntitiesView
      data={helpers}
      mode="entities"
      now={Date.now()}
      isControlEnabled
      onAction={onAction}
    />,
  )
  const user = userEvent.setup()
  await user.type(
    screen.getByLabelText("Timer label"),
    "Tea",
  )
  await user.click(
    screen.getByRole("button", { name: "Save" }),
  )
  expect(onAction).toHaveBeenCalledWith("set_value", {
    entityId: "input_text.timer_name",
    value: "Tea",
  })
  await user.selectOptions(
    screen.getByLabelText("Selection"),
    "Studio",
  )
  expect(onAction).toHaveBeenCalledWith("select_option", {
    entityId: "input_select.timer_room",
    option: "Studio",
  })
})

test("configured controls stay hidden until every gate is satisfied", async () => {
  const entities = [
    {
      id: "switch.machine",
      name: "Machine",
      state: "off",
      domain: "switch",
      attributes: {},
      actions: ["turn_on"],
    },
    {
      id: "input_boolean.machine_lock",
      name: "Lock",
      state: "on",
      domain: "input_boolean",
      attributes: {},
      actions: [],
    },
  ]
  const settings = {
    entityIds: [],
    actionButtons: [
      {
        name: "Power on",
        entityId: "switch.machine",
        action: "turn_on",
        visibleWhen: {
          entityId: "input_boolean.machine_lock",
          state: "off",
        },
      },
    ],
  }
  const onAction = vi.fn(async () => undefined)
  const view = render(
    <EntitiesView
      data={{ entities }}
      settings={settings}
      mode="entities"
      now={Date.now()}
      isControlEnabled
      onAction={onAction}
    />,
  )
  expect(
    screen.queryByRole("button", { name: "Power on" }),
  ).toBeNull()
  view.rerender(
    <EntitiesView
      data={{
        entities: entities.map((entity) =>
          entity.id === "input_boolean.machine_lock"
            ? { ...entity, state: "off" }
            : entity,
        ),
      }}
      settings={settings}
      mode="entities"
      now={Date.now()}
      isControlEnabled
      onAction={onAction}
    />,
  )
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Power on" }))
  expect(onAction).not.toHaveBeenCalled()
  expect(screen.getByRole("alertdialog")).toBeVisible()
  view.rerender(
    <EntitiesView
      data={{ entities }}
      settings={settings}
      mode="entities"
      now={Date.now()}
      isControlEnabled
      onAction={onAction}
    />,
  )
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Confirm" }),
    ).toBeDisabled(),
  )
})

test("image panels show absolute timer end times instead of rapidly stale seconds", () => {
  render(
    <DisplayPropertiesContext.Provider
      value={{
        delivery: "image",
        repaint: "slow",
        hasTouch: false,
      }}
    >
      <EntitiesView
        data={{
          entities: [
            {
              id: "timer.sample",
              name: "Sample timer",
              state: "active",
              domain: "timer",
              attributes: {
                finishes_at: "2026-01-01T12:10:00Z",
              },
              actions: ["pause"],
            },
          ],
        }}
        mode="timers"
        now={Date.parse("2026-01-01T12:00:00Z")}
        isControlEnabled={false}
        onAction={async () => undefined}
      />
    </DisplayPropertiesContext.Provider>,
  )
  expect(screen.getByText(/Ends at/)).toBeVisible()
  expect(screen.queryByText("10:00")).toBeNull()
})

test("the clock hides its minute value on a display that cannot finish it in time", () => {
  const view = render(
    <DisplayPropertiesContext.Provider
      value={{ delivery: "image", repaint: "super-slow" }}
    >
      <BuiltinView
        panel={{
          id: "time",
          specId: "clock",
          bindings: {},
          settings: {},
        }}
        data={undefined}
        isControlEnabled={false}
        onAction={async () => undefined}
      />
    </DisplayPropertiesContext.Provider>,
  )
  expect(view.container.querySelector("time")).toBeNull()
})

test("map requests are bounded and antimeridian locations stay together", () => {
  const viewport = buildMapViewport({
    entities: [
      {
        id: "one",
        name: "One",
        state: "home",
        domain: "person",
        attributes: { latitude: 10, longitude: 179.9 },
        actions: [],
      },
      {
        id: "two",
        name: "Two",
        state: "away",
        domain: "person",
        attributes: { latitude: 10.1, longitude: -179.9 },
        actions: [],
      },
    ],
  })
  expect(viewport.tiles.length).toBeLessThanOrEqual(20)
  expect(viewport.zoom).toBeGreaterThan(5)
  expect(
    viewport.locations.every(
      (location) =>
        location.horizontal >= 0 &&
        location.horizontal <= 768,
    ),
  ).toBe(true)
})

test("report attributes preserve tables but cannot execute HTML or fetch arbitrary images", () => {
  const view = render(
    <EntitiesView
      data={{
        entities: [
          {
            id: "sensor.report",
            name: "Report",
            state: "2",
            domain: "sensor",
            attributes: {
              md: '<table><tr><th>Service</th><td>Offline</td></tr></table><script>window.bad=true</script><img src="https://example.com/tracker"><a href="javascript:alert(1)">Unsafe link</a>',
            },
            actions: [],
          },
        ],
      }}
      settings={{
        entityIds: [],
        attributeFields: [
          {
            entityId: "sensor.report",
            attribute: "md",
            label: "Health report",
            format: "report",
          },
        ],
      }}
      mode="entities"
      now={Date.now()}
      isControlEnabled={false}
      onAction={async () => undefined}
    />,
  )
  expect(screen.getByRole("table")).toBeVisible()
  expect(screen.getByText("Offline")).toBeVisible()
  expect(view.container.querySelector("script")).toBeNull()
  expect(view.container.querySelector("img")).toBeNull()
  expect(view.container.querySelector("a")).toBeNull()
})

test("action-specific gates allow power off while power on remains locked", () => {
  render(
    <EntitiesView
      data={{
        entities: [
          {
            id: "switch.machine",
            name: "Machine",
            state: "on",
            domain: "switch",
            attributes: {},
            actions: ["turn_on", "turn_off"],
          },
          {
            id: "input_boolean.power_lock",
            name: "Power lock",
            state: "on",
            domain: "input_boolean",
            attributes: {},
            actions: [],
          },
        ],
      }}
      settings={{
        entityIds: ["switch.machine"],
        actionVisibility: {
          "switch.machine": {
            turn_on: {
              entityId: "input_boolean.power_lock",
              state: "off",
            },
          },
        },
      }}
      mode="entities"
      now={Date.now()}
      isControlEnabled
      onAction={async () => undefined}
    />,
  )
  expect(
    screen.queryByRole("button", { name: "Turn on" }),
  ).toBeNull()
  expect(
    screen.getByRole("button", { name: "Turn off" }),
  ).toBeVisible()
})

test("daily mean bar charts aggregate a day's measurements and categorical histories render a timeline", () => {
  const history = [
    { time: "2026-09-01T10:00:00", value: 10 },
    { time: "2026-09-01T11:00:00", value: 20 },
    { time: "2026-09-02T10:00:00", value: 30 },
  ]
  const now = Date.parse("2026-09-02T12:00:00")
  const samples = chartSamples({
    history,
    aggregation: "daily-mean",
    now,
  })
  expect(samples).toHaveLength(2)
  // Day one: 10 for one hour, then 20 for thirteen hours (no data before 10 AM).
  expect(samples[0]?.value).toBeCloseTo(270 / 14)
  // The carried value crosses midnight: 20 for ten hours, then 30 for two hours.
  expect(samples[1]?.value).toBeCloseTo(260 / 12)
  expect(new Date(samples[0]?.time ?? 0).getHours()).toBe(0)
  const entity = {
    id: "sensor.moisture",
    name: "Moisture",
    state: "30",
    domain: "sensor",
    attributes: { history },
    actions: [],
  }
  const view = render(
    <EntityChart
      entity={entity}
      settings={{
        chartType: "bar",
        aggregation: "daily-mean",
      }}
      now={now}
    />,
  )
  expect(screen.getByRole("img")).toHaveAccessibleName(
    "Moisture: 19.29 to 21.67, daily mean",
  )
  expect(
    view.container.querySelectorAll("rect"),
  ).toHaveLength(2)
  view.rerender(
    <EntityChart
      entity={{
        ...entity,
        attributes: {
          stateHistory: [
            {
              time: "2026-09-01T10:00:00Z",
              state: "online",
            },
            {
              time: "2026-09-01T11:00:00Z",
              state: "offline",
            },
          ],
        },
      }}
      settings={{}}
      now={Date.parse("2026-09-01T12:00:00Z")}
    />,
  )
  expect(screen.getByRole("img")).toHaveAccessibleName(
    "Moisture state history: online, offline",
  )
  expect(
    view.container.querySelectorAll("rect"),
  ).toHaveLength(2)
  expect(screen.getByText("offline")).toBeVisible()
})

test("photo selection follows time across fresh image capture pages", () => {
  const clock = vi
    .spyOn(Date, "now")
    .mockReturnValue(300_000)
  const panel = {
    id: "photos",
    specId: "photo-frame",
    bindings: { data: "images" },
    settings: { intervalSeconds: 300 },
  }
  const data = {
    images: [
      {
        id: "first",
        url: "/first.jpg",
        title: "First photo",
      },
      {
        id: "second",
        url: "/second.jpg",
        title: "Second photo",
      },
    ],
  }
  try {
    const firstCapture = render(
      <BuiltinView
        panel={panel}
        data={data}
        isControlEnabled={false}
        onAction={async () => undefined}
      />,
    )
    expect(screen.getByRole("img")).toHaveAttribute(
      "alt",
      "Second photo",
    )
    firstCapture.unmount()
    clock.mockReturnValue(600_000)
    render(
      <BuiltinView
        panel={panel}
        data={data}
        isControlEnabled={false}
        onAction={async () => undefined}
      />,
    )
    expect(screen.getByRole("img")).toHaveAttribute(
      "alt",
      "First photo",
    )
  } finally {
    clock.mockRestore()
  }
})

test("malformed control gates fail closed instead of exposing an action", () => {
  render(
    <EntitiesView
      data={helpers}
      mode="entities"
      now={Date.now()}
      settings={{ actionVisibilityJson: "{broken" }}
      isControlEnabled
      onAction={async () => undefined}
    />,
  )
  expect(screen.getByRole("alert")).toHaveTextContent(
    "invalid control conditions",
  )
  expect(screen.queryByRole("button")).toBeNull()
})

test("scan feedback labels today's points without inventing an account total", () => {
  render(
    <BuiltinView
      panel={{
        id: "award",
        specId: "points",
        bindings: { data: "points" },
        settings: {},
      }}
      data={{ name: "Player", pointsToday: 12, awarded: 3 }}
      isControlEnabled={false}
      onAction={async () => undefined}
    />,
  )
  expect(screen.getByText("12 points today")).toBeVisible()
  expect(screen.queryByText(/total points/)).toBeNull()
  expect(screen.getByText("+3 points")).toBeVisible()
})
