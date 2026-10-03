/** Printer details disappear before media; progress and controls remain required. */
export type PrinterDetailLevel = 0 | 1 | 2 | 3

/** Apply an explicit visibility tier to both measured probes and live cards. */
export const applyPrinterDetailLevel = (
  element: HTMLElement,
  detailLevel: PrinterDetailLevel,
) => {
  element.dataset.detailLevel = String(detailLevel)
}

/** Measure the actual styled facts at a candidate width without changing the live card. */
export const measurePrinterFacts = ({
  card,
  width,
  detailLevel,
  isCompact,
}: {
  card: HTMLElement
  width: number
  detailLevel: PrinterDetailLevel
  isCompact: boolean
}) => {
  const body =
    card.querySelector<HTMLElement>(".printer-body")
  if (!body) return 0
  const probe = card.cloneNode(false) as HTMLElement
  probe.inert = true
  probe.setAttribute("aria-hidden", "true")
  probe.dataset.orientation = "facts"
  probe.dataset.compact = String(isCompact)
  applyPrinterDetailLevel(probe, detailLevel)
  Object.assign(probe.style, {
    position: "absolute",
    visibility: "hidden",
    pointerEvents: "none",
    inlineSize: `${width}px`,
    blockSize: "auto",
    minBlockSize: "0",
    maxBlockSize: "none",
    padding: "0",
    inset: "0 auto auto 0",
  })
  probe.append(body.cloneNode(true))
  card.parentElement?.append(probe)
  // Client dimensions and layout budgets use CSS pixels, even under browser zoom.
  const height = probe.offsetHeight
  probe.remove()
  return height
}
