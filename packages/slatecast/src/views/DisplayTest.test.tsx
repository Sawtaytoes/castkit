import { render, screen } from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { expect, test } from "vitest"
import { buildSnapshot } from "../__fixtures__/buildSnapshot.ts"
import { mountSlatecast } from "../__tests__/setup/mountSlatecast.tsx"
import { Panel } from "../platform/Panel.tsx"
import "../styles.css"
import "../platform/platform.css"

test("full black and white cover the entire stage with no theme tint or visible controls", async () => {
  await mountSlatecast({
    snapshot: buildSnapshot({ view: "display-test" }),
  })
  const field = document.querySelector(
    ".display-test",
  ) as HTMLElement
  const stage = document.querySelector(
    ".stage",
  ) as HTMLElement
  const user = userEvent.setup()
  expect(getComputedStyle(field).backgroundColor).toBe(
    "rgb(0, 0, 0)",
  )
  expect(field.getBoundingClientRect().width).toBe(
    stage.getBoundingClientRect().width,
  )
  expect(field.getBoundingClientRect().height).toBe(
    stage.getBoundingClientRect().height,
  )
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Test pattern" }),
    "1",
  )
  expect(getComputedStyle(field).backgroundColor).toBe(
    "rgb(255, 255, 255)",
  )
  await user.click(
    screen.getByRole("button", { name: "Hide controls" }),
  )
  expect(
    screen.queryByRole("region", {
      name: "Display test controls",
    }),
  ).toBeNull()
  expect(field.children.length).toBe(0)
  await user.click(field)
  expect(
    screen.getByRole("region", {
      name: "Display test controls",
    }),
  ).toBeVisible()
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Test pattern" }),
    "0",
  )
  await user.click(
    screen.getByRole("button", { name: "Hide controls" }),
  )
  expect(getComputedStyle(field).backgroundColor).toBe(
    "rgb(0, 0, 0)",
  )
  expect(field.children.length).toBe(0)
})

test("controls disappear automatically and keyboard navigation works without touch", async () => {
  await mountSlatecast({
    snapshot: buildSnapshot({ view: "display-test" }),
  })
  await expect
    .poll(
      () =>
        screen.queryByRole("region", {
          name: "Display test controls",
        }),
      { timeout: 5_000 },
    )
    .toBeNull()
  const user = userEvent.setup()
  await user.keyboard("{ArrowRight}")
  expect(
    screen.getByRole("combobox", { name: "Test pattern" }),
  ).toHaveValue("1")
  await user.keyboard("{Escape}")
  expect(
    screen.queryByRole("region", {
      name: "Display test controls",
    }),
  ).toBeNull()
  await user.keyboard("{ArrowLeft}")
  expect(
    screen.getByRole("combobox", { name: "Test pattern" }),
  ).toHaveValue("0")
})

test("the saved diagnostic renders without a channel and keeps patterns inside its own panel", async () => {
  render(
    <Panel
      panel={{
        id: "diagnostic",
        specId: "display-test",
        bindings: {},
        settings: {},
      }}
      channels={{}}
      inputs={[]}
      isControlEnabled={false}
      onAction={async () => undefined}
      layoutStyle={{ width: "300px", height: "250px" }}
    />,
  )
  expect(screen.queryByRole("status")).toBeNull()
  const user = userEvent.setup()
  await user.click(
    screen.getByRole("button", { name: "Next" }),
  )
  const field = document.querySelector(
    ".display-test",
  ) as HTMLElement
  expect(getComputedStyle(field).backgroundColor).toBe(
    "rgb(255, 255, 255)",
  )
  expect(field.getBoundingClientRect().width).toBe(298)
  expect(field.getBoundingClientRect().height).toBe(248)
})
