import type { JSX } from "preact"
import { useState } from "preact/hooks"

type Props = Omit<
  JSX.InputHTMLAttributes<HTMLInputElement>,
  | "type"
  | "value"
  | "onInput"
  | "onChange"
  | "onChangeCapture"
> & {
  value: number
  onChange: (value: number) => void
}

/** Keep a range draft local so an in-flight action cannot interrupt its drag. */
export const RangeInput = ({
  value,
  onChange,
  ...properties
}: Props) => {
  const [draft, setDraft] = useState<number | null>(null)
  return (
    <input
      {...properties}
      type="range"
      value={draft ?? value}
      onInput={(event) =>
        setDraft(Number(event.currentTarget.value))
      }
      // Capture names the native change event even when compat rewrites
      // onChange to onInput. A touch/mouse drag commits only on release.
      onChangeCapture={(event) => {
        onChange(Number(event.currentTarget.value))
        setDraft(null)
      }}
      onTouchCancel={() => setDraft(null)}
      onPointerCancel={() => setDraft(null)}
    />
  )
}
