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
