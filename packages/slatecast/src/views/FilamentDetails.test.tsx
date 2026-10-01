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
