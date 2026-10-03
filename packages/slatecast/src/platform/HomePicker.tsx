import {
  useRovingFocus,
  useSinglePicker,
} from "@charcuterie/logic/preact"
import { useEffect, useRef, useState } from "preact/hooks"

/** A lightweight choice control uses the shared picker and independent keyboard focus. */
export const HomePicker = ({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) => {
  const picker = useSinglePicker<string>({
    selectedValue: value,
  })
  const focus = useRovingFocus<string>({
    activeValue: value,
  })
  const container = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  useEffect(() => {
    if (!isOpen) return
    const unregister = options.flatMap((option) => [
      picker.register(option),
      focus.register(option),
    ])
    return () =>
      unregister.forEach((dispose) => {
        dispose()
      })
  }, [options.join("\u0000"), isOpen])
  useEffect(() => {
    picker.select(value)
    focus.setActiveValue(value)
  }, [value])
  useEffect(() => {
    if (container.current?.contains(document.activeElement))
      container.current
        .querySelectorAll<HTMLElement>("[role=option]")
        [focus.activeIndex]?.focus()
  }, [focus.activeValue])
  return (
    <details
      class="home-picker"
      onToggle={(event) =>
        setIsOpen(event.currentTarget.open)
      }
    >
      <summary>
        {label}
        <strong>{value || "Choose…"}</strong>
      </summary>
      {isOpen ? (
        <div
          ref={container}
          role="listbox"
          aria-label={label}
          onKeyDown={(event) => {
            const movement = {
              ArrowDown: focus.next,
              ArrowUp: focus.previous,
              Home: focus.first,
              End: focus.last,
            }[event.key]
            if (movement) {
              event.preventDefault()
              movement()
            }
          }}
        >
          {options.map((option) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={
                picker.selectedValue === option
              }
              tabIndex={
                focus.activeValue === option ||
                (!focus.activeValue &&
                  options[0] === option)
                  ? 0
                  : -1
              }
              onFocus={() => focus.setActiveValue(option)}
              onClick={(event) => {
                picker.select(option)
                onChange(option)
                event.currentTarget
                  .closest("details")
                  ?.removeAttribute("open")
              }}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}
    </details>
  )
}
