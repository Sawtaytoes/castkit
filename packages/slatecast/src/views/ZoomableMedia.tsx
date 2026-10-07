import type { ComponentChildren, JSX } from "preact"
import { useEffect, useRef, useState } from "preact/hooks"

const initialTransform = {
  scale: 1,
  horizontal: 0,
  vertical: 0,
}
type Transform = typeof initialTransform
type Point = { horizontal: number; vertical: number }

/** Magnification belongs to an enlarged image, without replacing its live player. */
export const ZoomableMedia = ({
  children,
  isEnabled,
  onClose,
  closeLabel,
}: {
  children: ComponentChildren
  isEnabled: boolean
  onClose?: () => void
  closeLabel?: string
}) => {
  const surface = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, Point>())
  const transform = useRef<Transform>(initialTransform)
  const [displayTransform, setDisplayTransform] = useState(
    initialTransform,
  )
  const suppressedUntil = useRef(0)
  const geometry = () => {
    const points = Array.from(pointers.current.values())
    const first = points[0] ?? {
      horizontal: 0,
      vertical: 0,
    }
    const second = points[1] ?? first
    return {
      horizontal:
        (first.horizontal + second.horizontal) / 2,
      vertical: (first.vertical + second.vertical) / 2,
      distance: Math.hypot(
        first.horizontal - second.horizontal,
        first.vertical - second.vertical,
      ),
    }
  }
  const gesture = useRef({
    ...geometry(),
    ...initialTransform,
  })
  const commit = (next: Transform) => {
    const bounds = surface.current?.getBoundingClientRect()
    const scale = Math.max(1, Math.min(8, next.scale))
    const horizontalLimit =
      ((bounds?.width ?? 0) * (scale - 1)) / 2
    const verticalLimit =
      ((bounds?.height ?? 0) * (scale - 1)) / 2
    const value = {
      scale,
      horizontal: Math.max(
        -horizontalLimit,
        Math.min(horizontalLimit, next.horizontal),
      ),
      vertical: Math.max(
        -verticalLimit,
        Math.min(verticalLimit, next.vertical),
      ),
    }
    transform.current = value
    setDisplayTransform(value)
  }
  const beginGesture = () => {
    gesture.current = {
      ...transform.current,
      ...geometry(),
    }
  }
  useEffect(() => {
    if (!isEnabled) {
      pointers.current.clear()
      transform.current = initialTransform
      setDisplayTransform(initialTransform)
      suppressedUntil.current = 0
    }
  }, [isEnabled])
  const point = (
    event: JSX.TargetedPointerEvent<HTMLDivElement>,
  ) => {
    const bounds = surface.current?.getBoundingClientRect()
    return {
      horizontal:
        event.clientX -
        (bounds?.left ?? 0) -
        (bounds?.width ?? 0) / 2,
      vertical:
        event.clientY -
        (bounds?.top ?? 0) -
        (bounds?.height ?? 0) / 2,
    }
  }
  const baseline = useRef({
    offsetHorizontal: 0,
    offsetVertical: 0,
  })
  const finish = (
    event: JSX.TargetedPointerEvent<HTMLDivElement>,
  ) => {
    if (!isEnabled) return
    event.stopPropagation()
    pointers.current.delete(event.pointerId)
    beginGesture()
    baseline.current = {
      offsetHorizontal: transform.current.horizontal,
      offsetVertical: transform.current.vertical,
    }
  }
  return (
    <div
      class="zoomable-media"
      data-zoom-enabled={String(isEnabled)}
    >
      <div
        ref={surface}
        class="zoomable-media-surface"
        onPointerDown={(event) => {
          if (!isEnabled || event.button !== 0) return
          event.stopPropagation()
          pointers.current.set(
            event.pointerId,
            point(event),
          )
          event.currentTarget.setPointerCapture(
            event.pointerId,
          )
          beginGesture()
          baseline.current = {
            offsetHorizontal: transform.current.horizontal,
            offsetVertical: transform.current.vertical,
          }
        }}
        onPointerMove={(event) => {
          if (
            !isEnabled ||
            !pointers.current.has(event.pointerId)
          )
            return
          event.stopPropagation()
          pointers.current.set(
            event.pointerId,
            point(event),
          )
          const current = geometry()
          const start = gesture.current
          const ratio =
            pointers.current.size > 1 && start.distance > 0
              ? current.distance / start.distance
              : 1
          const scale = Math.max(
            1,
            Math.min(8, start.scale * ratio),
          )
          const actualRatio = scale / start.scale
          if (
            Math.abs(
              current.horizontal - start.horizontal,
            ) +
              Math.abs(current.vertical - start.vertical) >
              6 ||
            Math.abs(actualRatio - 1) > 0.02
          )
            suppressedUntil.current =
              performance.now() + 500
          commit({
            scale,
            horizontal:
              current.horizontal -
              (start.horizontal -
                baseline.current.offsetHorizontal) *
                actualRatio,
            vertical:
              current.vertical -
              (start.vertical -
                baseline.current.offsetVertical) *
                actualRatio,
          })
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
        onClickCapture={(event) => {
          if (
            isEnabled &&
            (transform.current.scale > 1 ||
              performance.now() < suppressedUntil.current)
          ) {
            event.preventDefault()
            event.stopPropagation()
          }
        }}
      >
        <div
          class="zoomable-media-content"
          style={
            isEnabled
              ? {
                  transform: `translate(${displayTransform.horizontal}px, ${displayTransform.vertical}px) scale(${displayTransform.scale})`,
                }
              : undefined
          }
        >
          {children}
        </div>
      </div>
      {isEnabled ? (
        <div class="media-zoom-controls">
          <button
            type="button"
            aria-label="Zoom out"
            disabled={displayTransform.scale <= 1}
            onClick={() =>
              commit({
                ...transform.current,
                scale: transform.current.scale / 1.5,
              })
            }
          >
            −
          </button>
          <output aria-label="Image zoom">
            {Math.round(displayTransform.scale * 100)}%
          </output>
          <button
            type="button"
            aria-label="Zoom in"
            disabled={displayTransform.scale >= 8}
            onClick={() =>
              commit({
                ...transform.current,
                scale: transform.current.scale * 1.5,
              })
            }
          >
            +
          </button>
          <button
            type="button"
            onClick={() => commit(initialTransform)}
          >
            Reset zoom
          </button>
          {onClose ? (
            <button
              type="button"
              aria-label={
                closeLabel ?? "Close enlarged image"
              }
              onClick={onClose}
            >
              Close
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
