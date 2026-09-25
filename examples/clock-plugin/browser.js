/** A renderer can use any framework; this example uses the DOM directly. */
export const mount = (element, initialHost) => {
  const heading = document.createElement("h2")
  const clock = document.createElement("time")
  heading.textContent = "Custom clock"
  clock.style.fontSize = "clamp(2rem, 8vw, 6rem)"
  element.append(heading, clock)
  const state = { host: initialHost }
  const render = () => {
    const snapshot = state.host.getChannel("time")
    const instant = snapshot?.data?.now
    clock.textContent = instant
      ? new Date(instant).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "Waiting for time"
    element.style.fontFamily =
      state.host.theme?.fontFamily ?? "sans-serif"
    element.style.color =
      state.host.theme?.foreground ?? "inherit"
  }
  const unsubscribe = initialHost.subscribe(render)
  render()
  return {
    update: (host) => {
      state.host = host
      render()
    },
    destroy: () => {
      unsubscribe()
      element.replaceChildren()
    },
  }
}
