import type { PrinterFilamentAssignment } from "@castkit/shared/viewData/types"
import { render, screen } from "@testing-library/preact"
import { expect, test, vi } from "vitest"
import {
  FilamentControl,
  FilamentDetailsDialog,
} from "./FilamentDetails.tsx"
import "../styles.css"

const filaments: readonly PrinterFilamentAssignment[] = [
  {
    name: "PLA Basic",
    color: "#000000",
    location: "AMS 2, slot 4",
  },
  {
    name: "PLA Translucent",
    color: "#f74e02",
    rgba: "F74E0280",
    brand: "Sample Brand",
    colorName: "Orange",
    location: "AMS 1, slot 3 · Filament 7 · 1.8 g",
  },
  {
    name: "PLA",
    color: "#cc3377",
    rgba: "CC3377FF",
    extraColors: ["2288CCFF"],
    effectType: "dual-color",
    location: "AMS 1, slot 1",
  },
  { name: "PLA", location: "Filament 4 · 0.5 g" },
]

test("the dialog draws inventory transparency and color bands with readable product details", () => {
  document.documentElement.dataset.scheme = "dark"
  render(
    <FilamentDetailsDialog
      printerName="Printer"
      jobName="Ornament"
      filaments={filaments}
      onClose={vi.fn()}
    />,
  )
  expect(
    screen.getByText("Orange PLA Translucent"),
  ).toBeVisible()
  expect(screen.getByText("Sample Brand")).toBeVisible()
  expect(
    screen.getByText("AMS 1, slot 3 · Filament 7 · 1.8 g"),
  ).toBeVisible()
  expect(screen.getByText("dual color")).toBeVisible()
  expect(
    screen.getByText(
      "AMS slot unavailable · Filament 4 · 0.5 g",
    ),
  ).toBeVisible()
  const orange = screen
    .getAllByRole("listitem")[1]
    ?.querySelector(".fss-swatch") as HTMLElement
  expect(
    getComputedStyle(orange).backgroundImage,
  ).toContain("repeating-conic-gradient")
  expect(
    getComputedStyle(orange, "::before").backgroundColor,
  ).toBe("rgba(247, 78, 2, 0.5)")
  const bands = screen
    .getAllByRole("listitem")[2]
    ?.querySelectorAll(".fss-band")
  expect(bands).toHaveLength(2)
  const unknown = screen
    .getAllByRole("listitem")[3]
    ?.querySelector(".fss-swatch") as HTMLElement
  expect(
    getComputedStyle(unknown).backgroundImage,
  ).toContain("repeating-linear-gradient")
})

test("the summary swatch follows the active AMS slot instead of the first archive filament", () => {
  render(
    <FilamentControl
      color="#f74e02"
      text="PLA Translucent · AMS 1 slot 3"
      filaments={filaments}
      isExpanded={false}
      onClick={vi.fn()}
    />,
  )
  const swatch = document.querySelector(
    ".printer-filament-button .fss-swatch",
  ) as HTMLElement
  expect(
    getComputedStyle(swatch).backgroundImage,
  ).toContain("repeating-conic-gradient")
  expect(
    getComputedStyle(swatch, "::before").backgroundColor,
  ).toBe("rgba(247, 78, 2, 0.5)")
})

const LONG_SUMMARY =
  "Glass Fiber Reinforced High Temperature Polycarbonate · AMS 1, slot 1"

test.each([
  { case: "no slot list", list: undefined },
  {
    case: "a slot with only a color",
    list: [{ color: "#1c2c6c", location: "AMS 1, slot 1" }],
  },
  {
    case: "a slot with neither name nor color",
    list: [{ location: "AMS 1, slot 1" }],
  },
] as const)("the dialog gives the feed's whole summary with $case", ({
  list,
}) => {
  render(
    <FilamentDetailsDialog
      printerName="Printer"
      jobName="Bracket"
      filaments={list}
      summary={LONG_SUMMARY}
      onClose={vi.fn()}
    />,
  )

  expect(screen.getByText(LONG_SUMMARY)).toBeVisible()
})

test("the dialog does not repeat a summary a slot already names", () => {
  render(
    <FilamentDetailsDialog
      printerName="Printer"
      jobName="Ornament"
      filaments={filaments}
      summary="PLA Basic · AMS 2, slot 4"
      onClose={vi.fn()}
    />,
  )

  expect(
    document.querySelector(".filament-details-summary"),
  ).toBeNull()
})

test.each([
  {
    case: "another slot's name only contains it",
    summary: "PLA · AMS 1, slot 1",
    list: [
      {
        name: "Support for PLA",
        color: "#f1e7d0",
        location: "AMS 2, slot 4",
      },
    ],
  },
  {
    case: "it has no tray and another name contains it",
    summary: "PLA",
    list: [
      {
        name: "Support for PLA",
        color: "#f1e7d0",
        location: "AMS 2, slot 4",
      },
    ],
  },
  {
    case: "a longer color name contains it",
    summary: "Blue PLA Silk · AMS 1, slot 1",
    list: [
      {
        name: "PLA Silk",
        colorName: "Dark Blue",
        location: "AMS 1, slot 1",
      },
    ],
  },
  {
    case: "the same material sits in another tray",
    summary: "PLA Basic · AMS 1, slot 1",
    list: [
      {
        name: "PLA Basic",
        color: "#000000",
        location: "AMS 2, slot 4",
      },
    ],
  },
  {
    case: "it says more than the slot",
    summary: "PLA Matte · AMS 1 slot 1 · Active spool",
    list: [
      {
        name: "PLA Matte",
        color: "#1c1c1c",
        location: "AMS 1, slot 1",
      },
    ],
  },
] as const)("the dialog gives the summary when $case", ({
  summary,
  list,
}) => {
  render(
    <FilamentDetailsDialog
      printerName="Printer"
      jobName="Bracket"
      filaments={list}
      summary={summary}
      onClose={vi.fn()}
    />,
  )

  expect(
    document.querySelector(".filament-details-summary"),
  ).toHaveTextContent(summary)
})

test.each([
  {
    case: "a doubled space",
    summary: "PLA  Matte · AMS 1, slot 1",
  },
  {
    case: "a tray written without its comma",
    summary: "PLA Matte · AMS 1 slot 1",
  },
  { case: "no tray", summary: "pla matte" },
  {
    case: "a dot without spaces",
    summary: "PLA Matte·AMS 1, slot 1",
  },
] as const)("the dialog does not repeat a summary with $case", ({
  summary,
}) => {
  render(
    <FilamentDetailsDialog
      printerName="Printer"
      jobName="Bracket"
      filaments={[
        {
          name: "PLA Matte",
          color: "#1c1c1c",
          location: "AMS 1, slot 1 · Filament 7 · 1.8 g",
        },
      ]}
      summary={summary}
      onClose={vi.fn()}
    />,
  )

  expect(
    document.querySelector(".filament-details-summary"),
  ).toBeNull()
})

test("the dialog does not repeat a slot whose own name has a dot", () => {
  render(
    <FilamentDetailsDialog
      printerName="Printer"
      jobName="Vase"
      filaments={[
        {
          name: "PLA · Silk",
          color: "#c0c0c0",
          location: "AMS 1, slot 1",
        },
      ]}
      summary="PLA · Silk · AMS 1 slot 1"
      onClose={vi.fn()}
    />,
  )

  expect(
    document.querySelector(".filament-details-summary"),
  ).toBeNull()
})
