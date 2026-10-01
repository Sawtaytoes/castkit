import type { Meta, StoryObj } from "@storybook/preact-vite"
import { FilamentDetailsDialog } from "../views/FilamentDetails.tsx"

/**
 * The per-slot list a printer card opens. Each row leads with the color in
 * words: the spool's own name when Bambuddy's inventory knows it, otherwise a
 * plain word read off the swatch, so two dark swatches never read the same.
 */
const meta: Meta<typeof FilamentDetailsDialog> = {
  title: "Views/Filament Details",
  component: FilamentDetailsDialog,
  decorators: [
    (Story) => (
      <main class="stage">
        <Story />
      </main>
    ),
  ],
  args: {
    printerName: "Printer",
    jobName: "Three_Ornament_Fronts",
    onClose: () => undefined,
  },
}
export default meta

type Story = StoryObj<typeof FilamentDetailsDialog>

/** An archive's slots, one matched to a named spool and two read off the swatch. */
export const ArchiveSlots: Story = {
  args: {
    filaments: [
      {
        name: "PLA Basic",
        color: "#3f8e43",
        colorName: "Mistletoe Green",
        location: "Filament 1 · 21 g",
      },
      {
        name: "PLA",
        color: "#000000",
        location: "Filament 2 · 0.7 g",
      },
      {
        name: "PLA",
        color: "#f4ee2a",
        location: "Filament 3 · 0.8 g",
      },
    ],
  },
}

/** A live AMS mapping, where each slot is a tray. */
export const AmsTrays: Story = {
  args: {
    filaments: [
      {
        name: "PLA Matte",
        color: "#9b9ea0",
        colorName: "Ash Gray",
        location: "AMS 1, slot 2",
      },
      {
        name: "PETG Translucent",
        color: "#8e8e8e",
        location: "AMS 2, slot 4",
      },
    ],
  },
}

/** Inventory appearances on the same component used by the AMS and spool picker. */
export const SpecialFinishes: Story = {
  args: {
    jobName: "Six_color_ornament",
    filaments: [
      {
        name: "PLA Basic",
        color: "#000000",
        colorName: "Black",
        brand: "Sample Brand",
        rgba: "000000FF",
        location: "AMS 2, slot 4 · Filament 1 · 4.1 g",
      },
      {
        name: "PLA Matte",
        color: "#042f56",
        colorName: "Dark Blue",
        brand: "Sample Brand",
        rgba: "042F56FF",
        location: "AMS 3, slot 1 · Filament 2 · 0.3 g",
      },
      {
        name: "PLA Matte",
        color: "#ffffff",
        colorName: "White",
        brand: "Sample Brand",
        rgba: "FFFFFFFF",
        location: "AMS 1, slot 1 · Filament 3 · 2.3 g",
      },
      {
        name: "PLA Matte",
        color: "#e8dbb7",
        colorName: "Tan",
        brand: "Sample Brand",
        rgba: "E8DBB7FF",
        location: "AMS 2, slot 1 · Filament 5 · 0.3 g",
      },
      {
        name: "PLA Basic",
        color: "#ff9016",
        colorName: "Pumpkin Orange",
        brand: "Sample Brand",
        rgba: "FF9016FF",
        location: "AMS 2, slot 2 · Filament 6 · 0.8 g",
      },
      {
        name: "PLA Translucent",
        color: "#f74e02",
        colorName: "Orange",
        brand: "Sample Brand",
        rgba: "F74E0280",
        location: "AMS 1, slot 3 · Filament 7 · 1.8 g",
      },
    ],
  },
}

/** Multicolor bands, named finishes, and a spool with no known color. */
export const ColorEffects: Story = {
  args: {
    filaments: [
      {
        name: "PLA",
        color: "#cc3377",
        colorName: "Rose and Blue",
        rgba: "CC3377FF",
        extraColors: ["2288CCFF"],
        effectType: "dual-color",
        brand: "Sample Brand",
        location: "AMS 1, slot 1",
      },
      {
        name: "PLA",
        color: "#152238",
        colorName: "Midnight",
        rgba: "152238FF",
        effectType: "galaxy",
        location: "AMS 1, slot 2",
      },
      {
        name: "PLA Silk",
        color: "#c6a050",
        colorName: "Gold",
        rgba: "C6A050FF",
        effectType: "silk",
        location: "AMS 1, slot 3",
      },
      {
        name: "PLA",
        location: "AMS slot unavailable · Filament 4",
      },
    ],
  },
}
