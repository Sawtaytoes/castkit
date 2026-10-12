/** A rectangle in Electron's device-independent pixels. */
export type Rectangle = {
  x: number
  y: number
  width: number
  height: number
}

/** The part of an Electron `Display` the placement logic reads. */
export type DisplaySnapshot = {
  id: number
  label: string
  bounds: Rectangle
  workArea: Rectangle
}

/** Where a window last was, as the desktop app saves it. */
export type SavedPlacement = {
  displayId: number
  displayLabel: string
  displayBounds: Rectangle
  windowBounds: Rectangle
}

/**
 * How a saved display was found again. Windows can renumber display ids after
 * a driver update or a re-plug, so an id miss falls back to the monitor's label
 * and geometry, and only then to the primary display.
 */
export type DisplayMatchKind =
  | "id"
  | "label-and-bounds"
  | "label-and-size"
  | "bounds"
  | "primary-fallback"

const isSameRectangle = (
  first: Rectangle,
  second: Rectangle,
) =>
  first.x === second.x &&
  first.y === second.y &&
  first.width === second.width &&
  first.height === second.height

const isSameSize = (first: Rectangle, second: Rectangle) =>
  first.width === second.width &&
  first.height === second.height

const findOnly = <Item>(
  items: Item[],
  isWanted: (item: Item) => boolean,
) => {
  const found = items.filter(isWanted)
  return found.length === 1 ? found[0] : undefined
}

/**
 * Find the display a saved window belongs on: by id, then by label and exact
 * bounds, then by label and size (the monitor was moved in the arrangement),
 * then by exact bounds (the label changed). The two looser steps accept only a
 * single candidate, because two monitors of one model share a label. When
 * nothing matches, the primary display is used and the caller logs it.
 */
export const matchDisplay = ({
  displays,
  placement,
  primaryDisplayId,
}: {
  displays: DisplaySnapshot[]
  placement: Pick<
    SavedPlacement,
    "displayId" | "displayLabel" | "displayBounds"
  >
  primaryDisplayId: number
}): {
  display: DisplaySnapshot
  matchedBy: DisplayMatchKind
} => {
  const byId = displays.find(
    (display) => display.id === placement.displayId,
  )
  if (byId) {
    return { display: byId, matchedBy: "id" }
  }
  const hasLabel = placement.displayLabel.length > 0
  const byLabelAndBounds = hasLabel
    ? displays.find(
        (display) =>
          display.label === placement.displayLabel &&
          isSameRectangle(
            display.bounds,
            placement.displayBounds,
          ),
      )
    : undefined
  if (byLabelAndBounds) {
    return {
      display: byLabelAndBounds,
      matchedBy: "label-and-bounds",
    }
  }
  const byLabelAndSize = hasLabel
    ? findOnly(
        displays,
        (display) =>
          display.label === placement.displayLabel &&
          isSameSize(
            display.bounds,
            placement.displayBounds,
          ),
      )
    : undefined
  if (byLabelAndSize) {
    return {
      display: byLabelAndSize,
      matchedBy: "label-and-size",
    }
  }
  const byBounds = findOnly(displays, (display) =>
    isSameRectangle(
      display.bounds,
      placement.displayBounds,
    ),
  )
  if (byBounds) {
    return { display: byBounds, matchedBy: "bounds" }
  }
  const primary =
    displays.find(
      (display) => display.id === primaryDisplayId,
    ) ?? displays[0]
  if (!primary) {
    throw new Error("Electron reported no displays.")
  }
  return { display: primary, matchedBy: "primary-fallback" }
}

const clamp = ({
  value,
  minimum,
  maximum,
}: {
  value: number
  minimum: number
  maximum: number
}) => Math.min(Math.max(value, minimum), maximum)

/**
 * Translate saved window bounds onto the display that was found for them. The
 * offset from the saved display's corner is kept, so a window restored onto
 * the same monitor at a new position in the arrangement lands where it was on
 * that monitor. The result always fits inside the target work area.
 */
export const placeWindowBounds = ({
  placement,
  display,
}: {
  placement: Pick<
    SavedPlacement,
    "displayBounds" | "windowBounds"
  >
  display: DisplaySnapshot
}): Rectangle => {
  const { workArea } = display
  const width = clamp({
    value: placement.windowBounds.width,
    minimum: 200,
    maximum: workArea.width,
  })
  const height = clamp({
    value: placement.windowBounds.height,
    minimum: 150,
    maximum: workArea.height,
  })
  const offsetX =
    placement.windowBounds.x - placement.displayBounds.x
  const offsetY =
    placement.windowBounds.y - placement.displayBounds.y
  return {
    x: clamp({
      value: display.bounds.x + offsetX,
      minimum: workArea.x,
      maximum: workArea.x + workArea.width - width,
    }),
    y: clamp({
      value: display.bounds.y + offsetY,
      minimum: workArea.y,
      maximum: workArea.y + workArea.height - height,
    }),
    width,
    height,
  }
}

/** One display as the menu and the identify overlay number it. */
export type NumberedDisplay = DisplaySnapshot & {
  number: number
  isPrimary: boolean
  name: string
}

/**
 * Number the displays left to right, then top to bottom, so "Display 2" names
 * the same monitor in the menu and on its identify overlay however Electron
 * happens to order them.
 */
export const numberDisplays = ({
  displays,
  primaryDisplayId,
}: {
  displays: DisplaySnapshot[]
  primaryDisplayId: number
}): NumberedDisplay[] =>
  displays
    .toSorted(
      (first, second) =>
        first.bounds.x - second.bounds.x ||
        first.bounds.y - second.bounds.y,
    )
    .map((display, index) => ({
      ...display,
      number: index + 1,
      isPrimary: display.id === primaryDisplayId,
      name: `${index + 1}: ${display.label || "Display"} (${display.bounds.width} x ${display.bounds.height})`,
    }))
