import {
  fireEvent,
  render,
  screen,
} from "@testing-library/preact"
import { expect, test, vi } from "vitest"
import { RangeInput } from "./RangeInput.tsx"

test("keeps movement local across source updates and commits the native release value once", () => {
  const onChange = vi.fn()
  const rendered = render(
    <RangeInput
      aria-label="Brightness"
      min={1}
      max={255}
      value={128}
      onChange={onChange}
    />,
  )
  const range = screen.getByRole("slider", {
    name: "Brightness",
  }) as HTMLInputElement
  fireEvent.input(range, { target: { value: "192" } })
  expect(onChange).not.toHaveBeenCalled()
  rendered.rerender(
    <RangeInput
      aria-label="Brightness"
      min={1}
      max={255}
      value={100}
      onChange={onChange}
    />,
  )
  expect(range.value).toBe("192")
  fireEvent.change(range, { target: { value: "200" } })
  expect(onChange).toHaveBeenCalledExactlyOnceWith(200)
})

test("a cancelled draft restores the source value without an action", () => {
  const onChange = vi.fn()
  render(
    <RangeInput
      aria-label="Brightness"
      min={1}
      max={255}
      value={128}
      onChange={onChange}
    />,
  )
  const range = screen.getByRole("slider", {
    name: "Brightness",
  }) as HTMLInputElement
  fireEvent.input(range, { target: { value: "192" } })
  fireEvent.touchCancel(range)
  expect(range.value).toBe("128")
  expect(onChange).not.toHaveBeenCalled()
})
