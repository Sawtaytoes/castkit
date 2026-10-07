import { formatTime } from "../formatTime.ts"
import { ICON_PATHS, Icon } from "../Icon.tsx"
import { printQueue, queue } from "../state.ts"

/**
 * The play queue — read-only for v1 (tap-to-jump is a stretch goal). The
 * shared parser caps the list at 50 items, so plain scrolling is fine
 * without virtualization at kiosk sizes.
 */
export const Queue = ({
  isPrintQueue = false,
}: {
  isPrintQueue?: boolean
}) => {
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

  return (
    <ul
      class="queue"
      aria-label={
        isPrintQueue ? "Print queue" : "Audio queue"
      }
    >
      {data.items.map((item, index) => (
        <li
          key={`${index}-${item.title}`}
          class={item.isCurrent ? "current" : ""}
          // The class alone is a purely visual distinction; screen readers
          // need the now-playing row called out too.
          aria-current={item.isCurrent ? "true" : undefined}
        >
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
        </li>
      ))}
    </ul>
  )
}
