import { signal } from "@preact/signals"

/**
 * Which screen of the Filament Spool Scale view is up.
 *
 * `spool` is the reader's own screen (ready, matched or unknown, decided by
 * the data). `ams` is the toggle's other side, with the printer whose units
 * are shown. `pick` is the inventory grid an unknown tag opens, copying a
 * spool onto the tag or linking one that has no tag yet. `assign` walks a
 * matched spool to a slot in three taps; each tap fills one more field.
 */
export type SpoolScreen =
  | { kind: "spool" }
  | { kind: "ams"; printerId?: string }
  | { kind: "pick"; mode: "copy" | "link" }
  | {
      kind: "assign"
      spoolId: string
      printerId?: string
      amsId?: number
    }

/**
 * The screen, as a module signal rather than component state, so a story can
 * open the view on any screen without driving the taps that lead there. The
 * navigation is local to the panel and never leaves it: the server holds no
 * opinion on which screen is up.
 */
export const spoolScreen = signal<SpoolScreen>({
  kind: "spool",
})

/** Back to the reader's own screen. */
export const resetSpoolScreen = () => {
  spoolScreen.value = { kind: "spool" }
}
