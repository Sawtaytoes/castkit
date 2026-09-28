/**
 * The views of a browser screen, as a row of tabs across its header.
 *
 * Each tab is a real link to `/view/<id>`: the platform's click delegate
 * turns it into the screen's `select` call, and middle-click, ctrl-click and
 * "open in a new tab" keep working. The row scrolls sideways when a screen
 * carries more views than fit (the Areas screen has thirty-two), and the
 * active tab is scrolled into view when it changes.
 *
 * This replaced a native `<select>` on 2026-09-28. The owner wants a
 * screen's views reachable the way Home Assistant's dashboard views are —
 * tabs at the top, every one visible — and the native select is deprecated
 * across the fleet. See
 * docs/decisions/2026-09-28-a-screens-views-are-tabs-across-its-header.md.
 */
import { useEffect, useRef } from "preact/hooks"

export const ViewTabs = ({
  views,
  activeId,
  isDisabled = false,
}: {
  views: { id: string; name: string }[]
  activeId: string
  isDisabled?: boolean
}) => {
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const active = listRef.current?.querySelector(
      '[aria-current="page"]',
    )
    if (active instanceof HTMLElement)
      active.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      })
  }, [activeId])
  return (
    <nav
      class="platform-view-tabs"
      aria-label="Views"
      data-disabled={String(isDisabled)}
    >
      <div ref={listRef}>
        {views.map((view) => (
          <a
            key={view.id}
            href={`/view/${encodeURIComponent(view.id)}`}
            aria-current={
              view.id === activeId ? "page" : undefined
            }
            aria-disabled={isDisabled ? "true" : undefined}
            data-castkit-target={`screen:select-view:${view.id}`}
            onClick={(event) => {
              if (isDisabled) event.preventDefault()
            }}
          >
            {view.name}
          </a>
        ))}
      </div>
    </nav>
  )
}
