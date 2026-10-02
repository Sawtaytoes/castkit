import {
  render,
  screen,
  waitFor,
} from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { expect, test } from "vitest"
import { page } from "vitest/browser"
import { PRINTERS as fixturePrinters } from "../__fixtures__/buildSpools.ts"
import { AmsFilaments } from "./AmsFilaments.tsx"
import "../styles.css"

const PRINTERS = fixturePrinters.map((printer, index) => ({
  ...printer,
  name: `Printer ${index + 1}`,
}))

test("fleet browsing is read-only and all 36 slot cards fit the workbench", async () => {
  await page.viewport(1280, 720)
  render(<AmsFilaments data={{ printers: PRINTERS }} />)
  await waitFor(() =>
    expect(
      document.querySelectorAll(".ams-slot"),
    ).toHaveLength(36),
  )
  const slots = Array.from(
    document.querySelectorAll(".ams-slot"),
  )
  expect(
    slots.every(
      (slot) => slot.getBoundingClientRect().bottom <= 720,
    ),
  ).toBe(true)
  expect(
    screen.queryByRole("button", { name: /Assign/ }),
  ).toBeNull()
  const user = userEvent.setup()
  await user.click(
    screen.getByRole("button", { name: "Spool rows" }),
  )
  expect(
    document.querySelectorAll(".fss-slot"),
  ).toHaveLength(12)
  await user.click(
    screen.getByRole("button", { name: "Printer 2" }),
  )
  expect(
    document.querySelectorAll(".fss-slot"),
  ).toHaveLength(12)
})

test("a narrow panel selects an AMS without clipping spool rows", async () => {
  await page.viewport(390, 720)
  render(
    <AmsFilaments
      data={{ printers: PRINTERS }}
      initialLayout="rows"
    />,
  )
  await waitFor(() =>
    expect(
      document.querySelectorAll(".fss-slot"),
    ).toHaveLength(4),
  )
  expect(
    screen.getByRole("navigation", { name: "AMS units" }),
  ).toBeVisible()
  expect(
    Array.from(
      document.querySelectorAll(".fss-slot"),
    ).every(
      (slot) => slot.getBoundingClientRect().bottom <= 720,
    ),
  ).toBe(true)
})

test("short displays use slot cards when spacious rows would be clipped", async () => {
  await page.viewport(480, 320)
  render(
    <AmsFilaments
      data={{ printers: PRINTERS }}
      initialLayout="rows"
    />,
  )
  await waitFor(() =>
    expect(
      document.querySelectorAll(".ams-slot"),
    ).toHaveLength(4),
  )
  expect(
    screen.getByRole("button", { name: "Spool rows" }),
  ).toBeDisabled()
  expect(
    Array.from(
      document.querySelectorAll(".ams-slot"),
    ).every(
      (slot) => slot.getBoundingClientRect().bottom <= 320,
    ),
  ).toBe(true)
})
