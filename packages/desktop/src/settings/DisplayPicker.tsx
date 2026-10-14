import { RadioGroup } from "@charcuterie/ui"
import { useEffect } from "react"
import { readDesktopBridge } from "./desktopBridge.ts"
import type { SettingsDisplay } from "./settingsApi.ts"

const readHoveredDisplayId = (target: EventTarget) => {
  const marker =
    target instanceof Element
      ? target
          .closest('[role="radio"]')
          ?.querySelector("[data-display-id]")
      : null
  const displayId = Number(
    marker?.getAttribute("data-display-id"),
  )
  return Number.isFinite(displayId) && marker
    ? displayId
    : null
}

/**
 * Which monitor a new window opens on. Holding the pointer over a monitor's
 * name frames that monitor, the way Image-Viewer's display menu does, so
 * the numbers need no "Identify displays" first.
 */
export const DisplayPicker = ({
  displays,
  selectedDisplayId,
  onChange,
}: {
  displays: SettingsDisplay[]
  selectedDisplayId: number | null
  onChange: (displayId: number) => void
}) => {
  const bridge = readDesktopBridge()

  // The highlight goes away with the list, even when no pointer left it.
  useEffect(
    () => () => {
      bridge.highlightDisplay(null)
    },
    [bridge],
  )

  return (
    <div
      onPointerOver={(event) => {
        const displayId = readHoveredDisplayId(event.target)
        if (displayId !== null) {
          bridge.highlightDisplay(displayId)
        }
      }}
      onPointerLeave={() => {
        bridge.highlightDisplay(null)
      }}
    >
      <RadioGroup
        // A monitor plugged in or out is a new list, seeded again.
        key={displays
          .map((display) => display.id)
          .join(",")}
        label="Display"
        size="sm"
        selectedValue={
          selectedDisplayId === null
            ? undefined
            : String(selectedDisplayId)
        }
        onChange={(value) => {
          if (value !== null) {
            onChange(Number(value))
          }
        }}
        items={displays.map((display) => ({
          value: String(display.id),
          label: (
            <span data-display-id={display.id}>
              {display.number}: {display.label}
            </span>
          ),
          hint: `${display.width} x ${display.height}${display.isPrimary ? ", primary" : ""}`,
        }))}
      />
    </div>
  )
}
