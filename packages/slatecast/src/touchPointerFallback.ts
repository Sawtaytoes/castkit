type Contact = {
  target: Element
  pointerId: number
  startX: number
  startY: number
  hasMoved: boolean
  isPrimary: boolean
}

/** The legacy Linux WebKit backend loses captured touch pointers during drags. */
export const getIsTouchPointerFallbackRequired = (
  userAgent = navigator.userAgent,
) =>
  /Linux/.test(userAgent) &&
  /AppleWebKit/.test(userAgent) &&
  !/Android|Chrome|Chromium|Edg\//.test(userAgent)

/**
 * Preserve a touch's original DOM target when WPE ignores pointer capture.
 * Touch events keep that target through movement and release. Mouse input and
 * native form controls retain their normal browser behavior.
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
        isNativeFormControl(event.target)
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
