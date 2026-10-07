import { useRef } from "preact/hooks"
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
  const data = isPrintQueue ? printQueue.value : queue.value
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

  const currentIndex = data.items.findIndex(
    (item) => item.isCurrent,
  )
  const isInteractive =
    !isPrintQueue && (device.value?.hasTouch ?? false)
  const isPlaying = nowPlaying.value?.isPlaying === true

  return (
    <ul
      class="queue"
      aria-label={
        isPrintQueue ? "Print queue" : "Audio queue"
      }
    >
      {data.items.map((item, index) => {
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
                onPointerDown={() => {
                  hasRowSwipe.current = false
                }}
                onPointerUp={() => {
                  hasRowSwipe.current = isViewSwipe.peek()
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
