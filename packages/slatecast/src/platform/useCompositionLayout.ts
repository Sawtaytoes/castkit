import type {
  ContractData,
  ViewPanel,
} from "@castkit/sdk/contracts"
import { getRunningKids } from "@castkit/sdk/kidsPointsScan"
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
import { chooseFocusedCompositionLayout } from "./focusedCompositionLayout.ts"
import { measurePrinterFacts } from "./printerContentFit.ts"

/** Measure actual content, then spend remaining space in priority order. */
export const useCompositionLayout = ({
  panels,
  mode,
  data,
  focusedKey,
  navigationRevision = 0,
}: {
  panels: { key: string; panel: ViewPanel }[]
  mode: string
  focusedKey?: string
  navigationRevision?: number
  data: Record<string, unknown>
}) => {
  const element = useRef<HTMLDivElement>(null)
  const [committed, setCommitted] = useState<{
    layout:
      | ReturnType<typeof chooseCompositionLayout>
      | ReturnType<typeof chooseFocusedCompositionLayout>
    revision: number
  }>()
  useLayoutEffect(() => {
    const container = element.current
    if (!container) return
    if (
      !focusedKey &&
      !["cards", "rail", "adaptive"].includes(mode)
    ) {
      setCommitted((previous) =>
        previous?.layout === undefined &&
        (previous?.revision ?? 0) === navigationRevision
          ? previous
          : {
              layout: undefined,
              revision: navigationRevision,
            },
      )
      return
    }
    const measure = () => {
      const computed = getComputedStyle(container)
      const gap =
        Number.parseFloat(computed.columnGap) || 12
      const renderedPanels = new Map(
        Array.from(
          container.querySelectorAll<HTMLElement>(
            "[data-composition-key]",
          ),
        ).map((panel) => [
          panel.dataset.compositionKey,
          panel,
        ]),
      )
      const items = panels.map(({ key, panel }) => {
        const child = renderedPanels.get(key)
        const image = child?.querySelector<
          HTMLImageElement | HTMLVideoElement
        >(".platform-printer-image")
        const isPrinter = panel.specId === "printer-status"
        const points =
          panel.specId === "kids-points"
            ? (data[key] as
                | ContractData["kids-points.v1"]
                | undefined)
            : undefined
        const hasRunningActivity = points
          ? getRunningKids({
              data: points,
              now: Date.now(),
            }).length > 0
          : false
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
          summaryHeight:
            panel.settings.isCompactSummary === true
              ? (hasRunningActivity ? 112 : 72) +
                insetHeight
              : undefined,
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
          minimumWidth: isPrinter ? 180 : usage ? 160 : 240,
          minimumHeight: isPrinter
            ? 0
            : panel.specId === "ai-usage"
              ? 104
              : 180,
        }
      })
      const measured = new Map<string, number>()
      const input: Parameters<
        typeof chooseCompositionLayout
      >[0] = {
        width: container.clientWidth,
        height: container.clientHeight,
        gap,
        items,
        mode: mode as "cards" | "rail" | "adaptive",
        measureFacts: (key, width, detailLevel = 0) => {
          const cacheKey = `${key}:${width}:${detailLevel}`
          const cached = measured.get(cacheKey)
          if (cached !== undefined) return cached
          const panelElement = renderedPanels.get(key)
          const body =
            panelElement?.querySelector<HTMLElement>(
              ".printer-body",
            )
          if (!body || !panelElement) return 220
          const panelStyle = getComputedStyle(panelElement)
          const insetWidth =
            Number.parseFloat(panelStyle.paddingLeft) +
            Number.parseFloat(panelStyle.paddingRight) +
            2
          const insetHeight =
            Number.parseFloat(panelStyle.paddingTop) +
            Number.parseFloat(panelStyle.paddingBottom) +
            2
          const card = body.parentElement as HTMLElement
          const height =
            measurePrinterFacts({
              card,
              width: Math.max(1, width - insetWidth),
              detailLevel,
              isCompact: true,
            }) + insetHeight
          measured.set(cacheKey, height)
          return height
        },
      }
      const next =
        (focusedKey
          ? chooseFocusedCompositionLayout({
              ...input,
              focusedKey,
            })
          : undefined) ?? chooseCompositionLayout(input)
      setCommitted((previous) =>
        previous?.revision === navigationRevision &&
        JSON.stringify(previous.layout) ===
          JSON.stringify(next)
          ? previous
          : { layout: next, revision: navigationRevision },
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
  }, [
    mode,
    focusedKey,
    navigationRevision,
    JSON.stringify(panels),
    JSON.stringify(data),
  ])
  return {
    element,
    layout: committed?.layout,
    navigationRevision: committed?.revision ?? 0,
  }
}
