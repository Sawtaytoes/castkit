import type { PrinterFilamentAssignment } from "@castkit/shared/viewData/types"
import {
  fireEvent,
  render,
  screen,
} from "@testing-library/preact"
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
    case: "it names a slot's filament but no tray",
    summary: "PLA Matte",
    list: [
      {
        name: "PLA Matte",
        color: "#1c1c1c",
        location: "AMS 1, slot 1",
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
  {
    case: "a dot without spaces",
    summary: "PLA Matte·AMS 1, slot 1",
  },
  {
    case: "a tray whose own dot has no spaces",
    summary: "PLA Matte · AMS 1, slot 1",
    location: "AMS 1, slot 1·Filament 7 · 1.8 g",
  },
] as const)("the dialog does not repeat a summary with $case", ({
  summary,
  location = "AMS 1, slot 1 · Filament 7 · 1.8 g",
}: {
  summary: string
  location?: string
}) => {
  render(
    <FilamentDetailsDialog
      printerName="Printer"
      jobName="Bracket"
      filaments={[
        {
          name: "PLA Matte",
          color: "#1c1c1c",
          location,
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

test("the dialog paints the slot that says the summary in the feed's color when it has none", () => {
  render(
    <FilamentDetailsDialog
      printerName="Printer"
      jobName="Vase"
      filaments={[
        { name: "PLA", location: "AMS 1 slot 1" },
        { name: "PETG", location: "AMS 1 slot 2" },
      ]}
      summary="PLA · AMS 1 slot 1"
      activeColor="#eb3f17"
      onClose={vi.fn()}
    />,
  )
  const swatches = Array.from(
    document.querySelectorAll<HTMLElement>(
      ".filament-details-swatch .fss-swatch",
    ),
  )

  expect(
    swatches[0]?.style.getPropertyValue("--c"),
  ).toMatch(/235,? 63,? 23|#eb3f17/i)
  // Another slot without a color is still unknown, not the active one.
  expect(swatches[1]).toHaveClass("is-hatched")
})

test("the dialog keeps the active color on the summary when two slots could say it", () => {
  render(
    <FilamentDetailsDialog
      printerName="Printer"
      jobName="Vase"
      filaments={[
        { name: "PLA Basic", location: "AMS 1 slot 1" },
        { name: "PLA Basic", location: "AMS 1 slot 2" },
      ]}
      summary="PLA Basic"
      activeColor="#eb3f17"
      onClose={vi.fn()}
    />,
  )
  const swatches = Array.from(
    document.querySelectorAll<HTMLElement>(
      ".filament-details-swatch .fss-swatch",
    ),
  )

  // Neither slot is named the active one, so neither takes its color; the
  // summary keeps it.
  const summary = document.querySelector(
    ".filament-details-summary",
  )
  expect(summary).toHaveTextContent("PLA Basic")
  expect(
    summary
      ?.querySelector<HTMLElement>(".fss-swatch")
      ?.style.getPropertyValue("--c"),
  ).toMatch(/235,? 63,? 23|#eb3f17/i)
  expect(swatches[0]).toHaveClass("is-hatched")
  expect(swatches[1]).toHaveClass("is-hatched")
})

test("the dialog keeps the active color on a summary with no tray, though one slot has its name", () => {
  render(
    <FilamentDetailsDialog
      printerName="Printer"
      jobName="Vase"
      filaments={[
        { name: "PLA Basic", location: "AMS 1 slot 1" },
        { location: "AMS 1 slot 2" },
      ]}
      summary="PLA Basic"
      activeColor="#eb3f17"
      onClose={vi.fn()}
    />,
  )
  const swatches = Array.from(
    document.querySelectorAll<HTMLElement>(
      ".filament-details-swatch .fss-swatch",
    ),
  )

  // The unnamed second slot may be the one printing, so the first slot's
  // name alone does not make it the active one.
  const summary = document.querySelector(
    ".filament-details-summary",
  )
  expect(summary).toHaveTextContent("PLA Basic")
  expect(
    summary
      ?.querySelector<HTMLElement>(".fss-swatch")
      ?.style.getPropertyValue("--c"),
  ).toMatch(/235,? 63,? 23|#eb3f17/i)
  expect(swatches[0]).toHaveClass("is-hatched")
  expect(swatches[1]).toHaveClass("is-hatched")
})

test("a finger drag scrolls a long slot list, and the drag is no tap", () => {
  const onClose = vi.fn()
  render(
    <FilamentDetailsDialog
      printerName="Printer"
      jobName="Vase"
      filaments={Array.from({ length: 16 }, (_, index) => ({
        name: `PLA ${index + 1}`,
        location: `AMS ${Math.floor(index / 4) + 1} slot ${(index % 4) + 1}`,
      }))}
      onClose={onClose}
    />,
  )
  const box = screen.getByRole("dialog")
  box.style.cssText =
    "height:160px;max-height:160px;overflow:auto"
  const touch = (clientY: number) => ({
    pointerId: 3,
    pointerType: "touch",
    clientX: 100,
    clientY,
  })
  // The finger starts on Close, so a drag that ended in a tap would close.
  const closeButton = screen.getByRole("button", {
    name: "Close",
  })
  fireEvent.pointerDown(closeButton, touch(150))
  fireEvent.pointerMove(closeButton, touch(110))
  fireEvent.pointerMove(closeButton, touch(50))
  fireEvent.pointerUp(closeButton, touch(50))
  fireEvent.click(closeButton)

  expect(box.dataset.castkitScroll).toBe("true")
  expect(getComputedStyle(box).touchAction).toBe("none")
  expect(box.scrollTop).toBe(100)
  expect(onClose).not.toHaveBeenCalled()
})
