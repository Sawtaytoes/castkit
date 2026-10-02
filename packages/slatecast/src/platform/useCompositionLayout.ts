import type {
  ContractData,
  ViewPanel,
} from "@castkit/sdk/contracts"
import {
  useLayoutEffect,
  useRef,
  useState,
} from "preact/hooks"
import {
  readAlertPercent,
  selectProviderRows,
} from "./aiUsageRows.ts"
import { chooseCompositionLayout } from "./compositionLayout.ts"

/** Measure actual content, then spend remaining space in priority order. */
export const useCompositionLayout = ({
  panels,
  mode,
  data,
}: {
  panels: { key: string; panel: ViewPanel }[]
  mode: string
  data: Record<string, unknown>
}) => {
  const element = useRef<HTMLDivElement>(null)
  const [layout, setLayout] =
    useState<ReturnType<typeof chooseCompositionLayout>>()
  useLayoutEffect(() => {
    const container = element.current
    if (
      !container ||
      !["cards", "rail", "adaptive"].includes(mode)
    )
      return
    const measure = () => {
      const computed = getComputedStyle(container)
      const gap =
        Number.parseFloat(computed.columnGap) || 12
      const items = panels.map(({ key, panel }, index) => {
        const child = container.children[index] as
          | HTMLElement
          | undefined
        const image = child?.querySelector<
          HTMLImageElement | HTMLVideoElement
        >(".platform-printer-image")
        const isPrinter = panel.specId === "printer-status"
        const usage =
          panel.specId === "ai-usage"
            ? (data[key] as
                | ContractData["ai-usage.v1"]
                | undefined)
            : undefined
        const usageRows = usage
          ? selectProviderRows({
              providers: usage.providers,
              alertPercent: readAlertPercent(
                panel.settings,
              ),
            })
          : undefined
        const childStyle = child
          ? getComputedStyle(child)
          : undefined
        const pixels = (value: string | undefined) =>
          Number.parseFloat(value ?? "") || 0
        const insetWidth =
          pixels(childStyle?.paddingLeft) +
          pixels(childStyle?.paddingRight) +
          pixels(childStyle?.borderLeftWidth) +
          pixels(childStyle?.borderRightWidth)
        const insetHeight =
          pixels(childStyle?.paddingTop) +
          pixels(childStyle?.paddingBottom) +
          pixels(childStyle?.borderTopWidth) +
          pixels(childStyle?.borderBottomWidth)
        return {
          key,
          isPrinter,
          priority: Number.isFinite(
            Number(panel.settings.priority),
          )
            ? Number(panel.settings.priority)
            : isPrinter
              ? 3
              : panel.specId === "rip-deck"
                ? 2
                : 1,
          aspectRatio: isPrinter
            ? image instanceof HTMLVideoElement &&
              image.videoWidth &&
              image.videoHeight
              ? image.videoWidth / image.videoHeight
              : image instanceof HTMLImageElement &&
                  image.naturalWidth &&
                  image.naturalHeight
                ? image.naturalWidth / image.naturalHeight
                : 16 / 9
            : panel.specId === "rip-deck"
              ? 2 / 3
              : undefined,
          usageRows,
          insetWidth,
          insetHeight,
          minimumWidth: isPrinter ? 280 : usage ? 320 : 240,
          minimumHeight: isPrinter
            ? 260
            : panel.specId === "ai-usage"
              ? 104
              : 180,
        }
      })
      const measured = new Map<string, number>()
      const next = chooseCompositionLayout({
        width: container.clientWidth,
        height: container.clientHeight,
        gap,
        items,
        mode: mode as "cards" | "rail" | "adaptive",
        measureFacts: (key, width) => {
          const cacheKey = `${key}:${width}`
          const cached = measured.get(cacheKey)
          if (cached !== undefined) return cached
          const index = panels.findIndex(
            (panel) => panel.key === key,
          )
          const body =
            container.children[
              index
            ]?.querySelector<HTMLElement>(".printer-body")
          if (!body) return 220
          const panelElement = container.children[
            index
          ] as HTMLElement
          const panelStyle = getComputedStyle(panelElement)
          const insetWidth =
            Number.parseFloat(panelStyle.paddingLeft) +
            Number.parseFloat(panelStyle.paddingRight) +
            2
          const insetHeight =
            Number.parseFloat(panelStyle.paddingTop) +
            Number.parseFloat(panelStyle.paddingBottom) +
            2
          const probe = body.cloneNode(true) as HTMLElement
          probe.inert = true
          probe.setAttribute("aria-hidden", "true")
          Object.assign(probe.style, {
            position: "absolute",
            visibility: "hidden",
            inlineSize: `${Math.max(1, width - insetWidth)}px`,
            blockSize: "auto",
            inset: "0 auto auto 0",
          })
          body.parentElement?.append(probe)
          const height =
            probe.getBoundingClientRect().height +
            insetHeight +
            12
          probe.remove()
          measured.set(cacheKey, height)
          return height
        },
      })
      setLayout((previous) =>
        JSON.stringify(previous) === JSON.stringify(next)
          ? previous
          : next,
      )
    }
    const pending = { frame: 0, isDisposed: false }
    const schedule = () => {
      if (pending.isDisposed) return
      cancelAnimationFrame(pending.frame)
      pending.frame = requestAnimationFrame(measure)
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(container)
    container.addEventListener("load", schedule, true)
    container.addEventListener(
      "loadedmetadata",
      schedule,
      true,
    )
    void document.fonts.ready.then(schedule)
    measure()
    return () => {
      pending.isDisposed = true
      cancelAnimationFrame(pending.frame)
      observer.disconnect()
      container.removeEventListener("load", schedule, true)
      container.removeEventListener(
        "loadedmetadata",
        schedule,
        true,
      )
    }
  }, [mode, JSON.stringify(panels), JSON.stringify(data)])
  return { element, layout }
}
