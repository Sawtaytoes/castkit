import {
  useLayoutEffect,
  useRef,
  useState,
} from "preact/hooks"
import { formatTime } from "../formatTime.ts"
import { ICON_PATHS, Icon } from "../Icon.tsx"
import {
  device,
  nowPlaying,
  playNext,
  printQueue,
  queue,
  togglePlayPause,
} from "../state.ts"
import { isViewSwipe } from "../viewSwipe.ts"

/**
 * Audio rows resume the current track or play the next one through the same
 * transport as the artwork. The feed has no stable item ids for arbitrary
 * jumps, so later rows remain passive. Print queues are always read-only.
 */
export const Queue = ({
  isPrintQueue = false,
}: {
  isPrintQueue?: boolean
}) => {
  const hasRowSwipe = useRef(false)
  const rowContact = useRef({ x: 0, y: 0 })
  const hasTouch = device.value?.hasTouch ?? false
  const list = useRef<HTMLUListElement>(null)
  const rowHeight = useRef(0)
  const [rowCount, setRowCount] = useState(1)
  const data = isPrintQueue ? printQueue.value : queue.value
  useLayoutEffect(() => {
    if (isPrintQueue || !list.current) return
    const root = list.current
    const measure = () => {
      const row = root.querySelector("li")
      if (row)
        rowHeight.current =
          row.getBoundingClientRect().height
      if (rowHeight.current <= 0) return
      const style = getComputedStyle(root)
      const gap = Number.parseFloat(style.rowGap) || 0
      const available =
        root.clientHeight -
        Number.parseFloat(style.paddingTop) -
        Number.parseFloat(style.paddingBottom)
      setRowCount(
        Math.max(
          0,
          Math.floor(
            (available + gap) / (rowHeight.current + gap),
          ),
        ),
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    const row = root.querySelector("li")
    if (row) observer.observe(row)
    const lifecycle = { isDisposed: false }
    void document.fonts.ready.then(() => {
      if (!lifecycle.isDisposed) measure()
    })
    return () => {
      lifecycle.isDisposed = true
      observer.disconnect()
    }
  }, [data, isPrintQueue])
  const currentIndex =
    data?.items.findIndex((item) => item.isCurrent) ?? -1
  useLayoutEffect(() => {
    const root = list.current
    if (!hasTouch || isPrintQueue || !root) return
    const row = root.children.item(
      Math.max(
        0,
        currentIndex -
          Math.min(2, Math.floor(rowCount / 3)),
      ),
    ) as HTMLElement | null
    root.scrollTop = row
      ? row.offsetTop -
        root.offsetTop -
        Number.parseFloat(getComputedStyle(root).paddingTop)
      : 0
  }, [hasTouch, isPrintQueue, rowCount, currentIndex])

  if (!data || data.items.length === 0) {
    return (
      <div class="idle">
        <div class="idle-title">
          {isPrintQueue
            ? data
              ? "Print queue is empty"
              : "Print queue unavailable"
            : "Queue is empty"}
        </div>
      </div>
    )
  }

  // Keep a little history above the current track, then fill every complete
  // row below it. At the end, use earlier history to fill the remaining room.
  const previousCount = Math.min(
    2,
    Math.floor(rowCount / 3),
  )
  const startIndex = isPrintQueue
    ? 0
    : Math.max(
        0,
        Math.min(
          Math.max(0, currentIndex) - previousCount,
          data.items.length - rowCount,
        ),
      )
  const items =
    isPrintQueue || hasTouch
      ? data.items
      : data.items.slice(startIndex, startIndex + rowCount)
  const isInteractive =
    !isPrintQueue && (device.value?.hasTouch ?? false)
  const isPlaying = nowPlaying.value?.isPlaying === true

  return (
    <ul
      ref={list}
      data-castkit-scroll={hasTouch ? "true" : undefined}
      data-castkit-target={
        hasTouch
          ? isPrintQueue
            ? "scroll:print-queue"
            : "scroll:audio-queue"
          : undefined
      }
      class={isPrintQueue ? "queue" : "queue audio-queue"}
      aria-label={
        isPrintQueue ? "Print queue" : "Audio queue"
      }
    >
      {items.map((item, visibleIndex) => {
        const index =
          (isPrintQueue || hasTouch ? 0 : startIndex) +
          visibleIndex
        const isNext =
          currentIndex >= 0 && index === currentIndex + 1
        const hasControl =
          isInteractive &&
          (isNext ||
            (item.isCurrent && nowPlaying.value !== null))
        const content = (
          <>
            {item.artworkPath ? (
              <img
                class="queue-art"
                src={item.artworkPath}
                alt=""
                loading="lazy"
                draggable={false}
              />
            ) : (
              <div class="queue-art placeholder">
                {isPrintQueue ? (
                  index + 1
                ) : (
                  <Icon path={ICON_PATHS.note} size="1em" />
                )}
              </div>
            )}
            <div class="queue-track">
              <div class="queue-title">{item.title}</div>
              <div class="queue-artist">{item.artist}</div>
            </div>
            {item.durationSeconds !== undefined ? (
              <span class="queue-duration">
                {isPrintQueue
                  ? `${Math.floor(item.durationSeconds / 3600)}h ${Math.floor((item.durationSeconds % 3600) / 60)}m`
                  : formatTime(item.durationSeconds)}
              </span>
            ) : null}
            {hasControl ? (
              <Icon path={ICON_PATHS.play} size="1em" />
            ) : null}
          </>
        )
        return (
          <li
            key={`${index}-${item.title}`}
            class={item.isCurrent ? "current" : ""}
            // The class alone is a purely visual distinction; screen readers
            // need the now-playing row called out too.
            aria-current={
              item.isCurrent ? "true" : undefined
            }
          >
            {hasControl ? (
              <button
                type="button"
                class="queue-play"
                aria-label={`${item.isCurrent ? (isPlaying ? "Playing" : "Resume") : "Play"} ${item.title}`}
                disabled={item.isCurrent && isPlaying}
                data-castkit-target={`audio-queue-${index}-${item.title}`}
                onPointerDown={(event) => {
                  rowContact.current = {
                    x: event.clientX,
                    y: event.clientY,
                  }
                  hasRowSwipe.current = false
                }}
                onPointerMove={(event) => {
                  if (
                    Math.hypot(
                      event.clientX - rowContact.current.x,
                      event.clientY - rowContact.current.y,
                    ) > 8
                  )
                    hasRowSwipe.current = true
                }}
                onPointerUp={() => {
                  hasRowSwipe.current =
                    hasRowSwipe.current ||
                    isViewSwipe.peek()
                }}
                onPointerCancel={() => {
                  hasRowSwipe.current = true
                }}
                onKeyDown={() => {
                  hasRowSwipe.current = false
                }}
                onClick={() => {
                  if (hasRowSwipe.current) return
                  if (isNext) playNext()
                  else if (!isPlaying) togglePlayPause()
                }}
              >
                {content}
              </button>
            ) : (
              <div class="queue-row">{content}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
