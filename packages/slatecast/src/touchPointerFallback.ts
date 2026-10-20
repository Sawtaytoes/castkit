type Contact = {
  target: Element
  pointerId: number
  startX: number
  startY: number
  hasMoved: boolean
  isPrimary: boolean
  initialRangeValue: string | null
}

/** The legacy Linux WebKit backend loses captured touch pointers during drags. */
export const getIsTouchPointerFallbackRequired = (
  userAgent = navigator.userAgent,
) =>
  /Linux/.test(userAgent) &&
  /AppleWebKit/.test(userAgent) &&
  !/Android|Chrome|Chromium|Edg\//.test(userAgent)

const getNativeRange = (target: Element) =>
  target instanceof HTMLInputElement &&
  target.type === "range" &&
  target.getAttribute("data-castkit-target") !==
    "now-playing-volume"
    ? target
    : null

const updateRange = ({
  range,
  touch,
}: {
  range: HTMLInputElement
  touch: Touch
}) => {
  const bounds = range.getBoundingClientRect()
  if (!bounds.width || range.matches(":disabled")) {
    return
  }
  const minimum = range.min === "" ? 0 : Number(range.min)
  const maximum = range.max === "" ? 100 : Number(range.max)
  const fraction = Math.max(
    0,
    Math.min(
      1,
      (touch.clientX - bounds.left) / bounds.width,
    ),
  )
  const progress =
    getComputedStyle(range).direction === "rtl"
      ? 1 - fraction
      : fraction
  const previous = range.value
  // Let the native setter clamp and snap to the input's own min/max/step.
  range.value = String(
    minimum + progress * (maximum - minimum),
  )
  if (range.value !== previous) {
    range.dispatchEvent(
      new Event("input", { bubbles: true }),
    )
  }
}

/**
 * Preserve a touch's original DOM target when WPE ignores pointer capture.
 * Touch events keep that target through movement and release. Mouse input and
 * other native form controls retain their normal browser behavior. Native ranges
 * follow touch coordinates and commit a change on release, just as mouse drags do.
 */
export const installTouchPointerFallback = () => {
  const lifetime = new AbortController()
  const options = {
    capture: true,
    passive: false,
    signal: lifetime.signal,
  }
  const contacts = new Map<number, Contact>()
  const pending = new Map<number, PointerEvent>()
  const pointerIds = new Set<number>()
  const replayed = new WeakSet<Event>()
  const isNativeFormControl = (target: Element) => {
    const control = target.closest(
      "input, textarea, select",
    )
    return (
      Boolean(control) &&
      !getNativeRange(target) &&
      control?.getAttribute("data-castkit-target") !==
        "now-playing-volume"
    )
  }

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (
        event.pointerType !== "touch" ||
        replayed.has(event) ||
        !(event.target instanceof Element) ||
        isNativeFormControl(event.target) ||
        event.target.matches(":disabled")
      ) {
        return
      }
      pending.set(event.pointerId, event)
      pointerIds.add(event.pointerId)
      event.stopImmediatePropagation()
    },
    options,
  )
  ;[
    "pointermove",
    "pointerup",
    "pointercancel",
    "lostpointercapture",
  ].forEach((type) => {
    document.addEventListener(
      type,
      (event) => {
        if (
          event instanceof PointerEvent &&
          pointerIds.has(event.pointerId) &&
          !replayed.has(event)
        ) {
          event.stopImmediatePropagation()
        }
      },
      options,
    )
  })
  const dispatch = ({
    contact,
    touch,
    type,
  }: {
    contact: Contact
    touch: Touch
    type: string
  }) => {
    const range = getNativeRange(contact.target)
    if (range) {
      if (
        !contact.isPrimary ||
        !range.isConnected ||
        range.matches(":disabled")
      ) {
        return
      }
      if (type === "pointercancel") {
        return
      }
      updateRange({ range, touch })
      if (type === "pointerdown") {
        range.focus({ preventScroll: true })
      }
      if (
        type === "pointerup" &&
        range.value !== contact.initialRangeValue
      ) {
        range.dispatchEvent(
          new Event("change", { bubbles: true }),
        )
      }
      return
    }
    const event = new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: contact.pointerId,
      pointerType: "touch",
      isPrimary: contact.isPrimary,
      clientX: touch.clientX,
      clientY: touch.clientY,
      button: 0,
      buttons:
        type === "pointerup" || type === "pointercancel"
          ? 0
          : 1,
    })
    replayed.add(event)
    contact.target.dispatchEvent(event)
  }
  ;[
    "touchstart",
    "touchmove",
    "touchend",
    "touchcancel",
  ].forEach((type) => {
    document.addEventListener(
      type,
      (event) => {
        if (!(event instanceof TouchEvent)) {
          return
        }
        Array.from(event.changedTouches).forEach(
          (touch) => {
            if (!(touch.target instanceof Element)) {
              return
            }
            if (type === "touchstart") {
              const match = Array.from(pending).find(
                ([, pointer]) =>
                  pointer.target === touch.target,
              )
              if (!match) {
                return
              }
              const [pointerId] = match
              pending.delete(pointerId)
              const contact = {
                target: touch.target,
                pointerId,
                startX: touch.clientX,
                startY: touch.clientY,
                hasMoved: false,
                isPrimary: contacts.size === 0,
                initialRangeValue:
                  getNativeRange(touch.target)?.value ??
                  null,
              }
              contacts.set(touch.identifier, contact)
              event.preventDefault()
              dispatch({
                contact,
                touch,
                type: "pointerdown",
              })
              return
            }
            const contact = contacts.get(touch.identifier)
            if (!contact) {
              return
            }
            event.preventDefault()
            contact.hasMoved ||=
              Math.hypot(
                touch.clientX - contact.startX,
                touch.clientY - contact.startY,
              ) >= 6
            dispatch({
              contact,
              touch,
              type:
                type === "touchmove"
                  ? "pointermove"
                  : type === "touchend"
                    ? "pointerup"
                    : "pointercancel",
            })
            if (type !== "touchmove") {
              contacts.delete(touch.identifier)
              pointerIds.delete(contact.pointerId)
              const button =
                contact.target.closest("button, a")
              if (
                type === "touchend" &&
                !contact.hasMoved &&
                button instanceof HTMLElement &&
                button.isConnected
              ) {
                button.click()
              }
            }
          },
        )
      },
      options,
    )
  })
  return () => lifetime.abort()
}
