import type { ContractData } from "@castkit/sdk/contracts"
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { expect, test, vi } from "vitest"
import { CamerasView } from "./CamerasView.tsx"
import { EntitiesView } from "./EntitiesView.tsx"
import { HomePicker } from "./HomePicker.tsx"
import "../styles.css"
import "./platform.css"

const lamp = {
  id: "light.example",
  name: "Studio lamp",
  domain: "light",
  state: "on",
  attributes: {
    brightness: 128,
    supported_color_modes: ["rgb", "color_temp"],
    rgb_color: [255, 0, 0],
    color_temp_kelvin: 3500,
    min_color_temp_kelvin: 2000,
    max_color_temp_kelvin: 6500,
    effect_list: ["Solid", "Rainbow"],
    effect: "Solid",
  },
  actions: ["turn_on", "turn_off", "toggle"],
}
const renderLights = ({
  isControlEnabled = true,
  settings = {},
  entities = [lamp],
}: {
  isControlEnabled?: boolean
  settings?: Record<string, unknown>
  entities?: ContractData["entities.v1"]["entities"]
} = {}) => {
  const onAction = vi.fn(async () => undefined)
  render(
    <EntitiesView
      data={{ entities }}
      mode="entities"
      settings={{ presentation: "home", ...settings }}
      now={0}
      isControlEnabled={isControlEnabled}
      onAction={onAction}
    />,
  )
  return onAction
}

test("light brightness has a proportional indicator and dispatches percent, RGB, white, and effect controls", async () => {
  const onAction = renderLights()
  expect(
    screen.getByRole("progressbar").getAttribute("value"),
  ).toBe("50")
  await waitFor(() =>
    expect(
      screen.queryByText("Loading controls…"),
    ).toBeNull(),
  )
  fireEvent.change(
    screen.getByRole("slider", {
      name: "Studio lamp brightness",
    }),
    { target: { value: "75" } },
  )
  expect(onAction).toHaveBeenLastCalledWith("turn_on", {
    entityId: lamp.id,
    brightness: 191,
  })
  const user = userEvent.setup()
  await waitFor(() =>
    expect(
      screen.queryByText("Loading controls…"),
    ).toBeNull(),
  )
  await user.click(screen.getByText("Color & effects"))
  fireEvent.change(
    screen.getByLabelText("Studio lamp color"),
    { target: { value: "#123456" } },
  )
  expect(onAction).toHaveBeenLastCalledWith("turn_on", {
    entityId: lamp.id,
    rgb_color: [18, 52, 86],
  })
  fireEvent.change(
    screen.getByLabelText("Studio lamp white temperature"),
    { target: { value: "4000" } },
  )
  expect(onAction).toHaveBeenLastCalledWith("turn_on", {
    entityId: lamp.id,
    color_temp_kelvin: 4000,
  })
  await user.click(screen.getByText("Studio lamp effect"))
  await user.click(
    screen.getByRole("option", { name: "Rainbow" }),
  )
  expect(onAction).toHaveBeenLastCalledWith("turn_on", {
    entityId: lamp.id,
    effect: "Rainbow",
  })
  fireEvent.change(
    screen.getByRole("slider", {
      name: "Studio lamp brightness",
    }),
    { target: { value: "0" } },
  )
  expect(onAction).toHaveBeenLastCalledWith("turn_off", {
    entityId: lamp.id,
  })
})

test("off lights show zero regardless of retained brightness and monochrome lights have no color control", () => {
  renderLights({
    entities: [
      {
        ...lamp,
        state: "off",
        attributes: {
          brightness: 128,
          supported_color_modes: ["brightness"],
        },
      },
    ],
  })
  expect(
    screen.getByRole("progressbar").getAttribute("value"),
  ).toBe("0")
  expect(screen.queryByText("Color & effects")).toBeNull()
})

test("visible light controls cannot bypass unavailable or restricted actions", async () => {
  const onAction = renderLights({ isControlEnabled: false })
  await waitFor(() =>
    expect(
      screen.queryByText("Loading controls…"),
    ).toBeNull(),
  )
  const user = userEvent.setup()
  await user.click(
    screen.getByRole("button", { name: "Turn off" }),
  )
  fireEvent.change(
    screen.getByRole("slider", {
      name: "Studio lamp brightness",
    }),
    {
      target: { value: "75" },
    },
  )
  expect(onAction).not.toHaveBeenCalled()
  expect(
    screen
      .getByRole("button", { name: "Turn off" })
      .closest("fieldset")?.disabled,
  ).toBe(true)
})

test("individual light controls retain child visibility and action gates", async () => {
  const child = {
    ...lamp,
    id: "light.child",
    name: "LED strip",
  }
  const onAction = renderLights({
    entities: [lamp, child],
    settings: {
      entityIds: [lamp.id],
      relatedEntities: { [lamp.id]: [child.id] },
      actionVisibility: {
        [child.id]: {
          turn_on: { entityId: lamp.id, state: "off" },
        },
      },
    },
  })
  const user = userEvent.setup()
  await user.click(
    screen.getByText("Individual lights · 1"),
  )
  expect(screen.getByText("LED strip")).toBeTruthy()
  expect(
    screen.queryByRole("slider", {
      name: "LED strip brightness",
    }),
  ).toBeNull()
  expect(onAction).not.toHaveBeenCalled()
})

test("picker arrows move focus without sending a service, Enter selects once, and external state updates remain authoritative", async () => {
  const onChange = vi.fn()
  const rendered = render(
    <HomePicker
      label="Effect"
      value="Solid"
      options={["Solid", "Rainbow"]}
      onChange={onChange}
    />,
  )
  const user = userEvent.setup()
  await user.click(screen.getByText("Effect"))
  screen.getByRole("option", { name: "Solid" }).focus()
  await user.keyboard("{ArrowDown}")
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole("option", { name: "Rainbow" }),
    ),
  )
  expect(onChange).not.toHaveBeenCalled()
  await user.keyboard("{Enter}")
  expect(onChange).toHaveBeenCalledExactlyOnceWith(
    "Rainbow",
  )
  expect(document.activeElement?.tagName).toBe("SUMMARY")
  rendered.rerender(
    <HomePicker
      label="Effect"
      value="Solid"
      options={["Solid", "Rainbow"]}
      onChange={onChange}
    />,
  )
  expect(onChange).toHaveBeenCalledTimes(1)
})

test("camera expansion keeps the same media element, traps focus, and restores the opener on Escape", async () => {
  render(
    <div class="platform">
      <CamerasView
        data={{
          cameras: [
            {
              id: "camera.example",
              name: "Sample camera",
              url: "/example.jpg",
              isLive: false,
            },
          ],
        }}
        settings={{
          aliases: { "camera.example": "Studio" },
        }}
      />
    </div>,
  )
  const image = screen.getByAltText("Studio camera")
  const opener = screen.getByRole("button", {
    name: "Expand Studio",
  })
  const user = userEvent.setup()
  await user.click(opener)
  expect(
    screen.getByRole("dialog", { name: "Studio" }),
  ).toBeTruthy()
  expect(screen.getByAltText("Studio camera")).toBe(image)
  await user.keyboard("{Tab}")
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Close Studio" }),
  )
  await user.keyboard("{Escape}")
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).toBeNull(),
  )
  expect(document.activeElement).toBe(opener)
})
