import type { TargetedPointerEvent } from "preact"
import { useState } from "preact/hooks"

type TouchPoint = {
  xPercent: number
  yPercent: number
}

const TARGETS = [
  { xPercent: 12, yPercent: 18 },
  { xPercent: 88, yPercent: 18 },
  { xPercent: 50, yPercent: 50 },
  { xPercent: 12, yPercent: 82 },
  { xPercent: 88, yPercent: 82 },
] as const

/** Shows the exact coordinate Chromium receives for each physical tap. */
export const TouchTest = () => {
  const [point, setPoint] = useState<TouchPoint | null>(
    null,
  )

  const recordPoint = (
    event: TargetedPointerEvent<HTMLDivElement>,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setPoint({
      xPercent:
        ((event.clientX - rect.left) / rect.width) * 100,
      yPercent:
        ((event.clientY - rect.top) / rect.height) * 100,
    })
  }

  return (
    <div class="touch-test" onPointerDown={recordPoint}>
      <div class="touch-test-copy">
        <h1>Touch test</h1>
        <p>
          Tap each ring. The blue dot must appear under your
          finger.
        </p>
        {point ? (
          <output>
            Reported: {Math.round(point.xPercent)}% across,{" "}
            {Math.round(point.yPercent)}% down
          </output>
        ) : null}
      </div>
      {TARGETS.map((target) => (
        <div
          key={`${target.xPercent}-${target.yPercent}`}
          class="touch-test-target"
          aria-hidden="true"
          style={{
            left: `${target.xPercent}%`,
            top: `${target.yPercent}%`,
          }}
        />
      ))}
      {point ? (
        <div
          class="touch-test-point"
          style={{
            left: `${point.xPercent}%`,
            top: `${point.yPercent}%`,
          }}
        />
      ) : null}
    </div>
  )
}
