import type { ComponentProps } from "preact"
import {
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "preact/hooks"
import { ICON_PATHS, Icon } from "../Icon.tsx"
import { CompositionNavigation } from "../platform/CompositionNavigation.ts"
import { useCompositionVisibility } from "../platform/CompositionVisibility.ts"
import { useDisplayProperties } from "../platform/displayProperties.ts"
import { safeMediaUrl } from "../platform/protocol.ts"
import { MusicPlayer } from "./MusicPlayer.tsx"
import { splitQueue } from "./musicPlayerModel.ts"
import "./compactMusicPlayer.css"

/** A small music card; opening it gives the full player first claim on the composition. */
export const CompactMusicPlayer = ({
  data,
  isControlEnabled,
  onAction,
  ...playerOptions
}: ComponentProps<typeof MusicPlayer>) => {
  const navigation = useContext(CompositionNavigation)
  const isVisible = useCompositionVisibility()
  const { isInteractive } = useDisplayProperties()
  const [isExpanded, setExpanded] = useState(false)
  const [queueRows, setQueueRows] = useState(0)
  const element = useRef<HTMLElement>(null)
  const release = useRef(navigation?.release)
  release.current = navigation?.release
  const selectExpanded = (isOpen: boolean) => {
    const update = () => setExpanded(isOpen)
    if (navigation) navigation.navigate(update, isOpen)
    else update()
  }
  useLayoutEffect(() => () => release.current?.(), [])
  useLayoutEffect(() => {
    if (!isVisible || navigation?.isDetailFocused === false)
      setExpanded(false)
    if (!isVisible) release.current?.()
  }, [isVisible, navigation?.isDetailFocused])
  useLayoutEffect(() => {
    const container = element.current
    if (!container || !isVisible || isExpanded) return
    const measure = () => {
      // Metadata and transport fit first. Only complete queue rows spend the remainder.
      setQueueRows(
        Math.max(
          0,
          Math.floor(
            (container.clientHeight - 112 - 26) / 40,
          ),
        ),
      )
    }
    measure()
    const pending = { frame: 0 }
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(pending.frame)
      pending.frame = requestAnimationFrame(measure)
    })
    observer.observe(container)
    return () => {
      cancelAnimationFrame(pending.frame)
      observer.disconnect()
    }
  }, [isVisible, isExpanded])
  const artwork = safeMediaUrl(data?.current?.artworkPath)
  const [failedArtwork, setFailedArtwork] =
    useState<string>()
  const isPlaying = data?.player?.state === "playing"
  const upcoming = splitQueue({
    items: data?.queue?.items ?? [],
    currentIndex: data?.queue?.currentIndex,
    playedRowCount: 0,
  }).upcoming.slice(0, queueRows)
  if (isExpanded)
    return (
      <div class="compact-music-detail">
        <button
          type="button"
          class="compact-music-back"
          onClick={() => selectExpanded(false)}
        >
          Back to overview
        </button>
        <MusicPlayer
          {...playerOptions}
          data={data}
          isControlEnabled={isControlEnabled}
          onAction={onAction}
        />
      </div>
    )
  return (
    <section
      ref={element}
      class="compact-music"
      aria-label="Compact music player"
    >
      <button
        type="button"
        class="compact-music-open"
        aria-label="Open full music player and queue"
        disabled={!isInteractive}
        onClick={() => selectExpanded(true)}
      >
        {artwork && artwork !== failedArtwork ? (
          <img
            src={artwork}
            alt=""
            onError={() => setFailedArtwork(artwork)}
            data-castkit-media-readiness="optional"
          />
        ) : (
          <span class="compact-music-art">
            <Icon path={ICON_PATHS.note} size="32px" />
          </span>
        )}
        <span class="compact-music-meta">
          <small>
            {isPlaying
              ? "Now playing"
              : data?.player?.state === "paused"
                ? "Paused"
                : "Music"}
          </small>
          <strong>
            {data?.current?.title || "Nothing playing"}
          </strong>
          <span>
            {data?.current?.artist ||
              data?.player?.name ||
              "Choose music in the full player"}
          </span>
        </span>
      </button>
      <div class="compact-music-controls">
        {(
          [
            [
              "Previous",
              ICON_PATHS.previous,
              "previous",
              !data?.queue,
            ],
            [
              isPlaying ? "Pause" : "Play",
              isPlaying
                ? ICON_PATHS.pause
                : ICON_PATHS.play,
              "play_pause",
              !data?.player,
            ],
            ["Next", ICON_PATHS.next, "next", !data?.queue],
          ] as const
        ).map(([label, path, action, isUnavailable]) => (
          <button
            key={action}
            type="button"
            aria-label={label}
            disabled={!isControlEnabled || isUnavailable}
            onClick={() => void onAction(action)}
          >
            <Icon path={path} size="20px" />
          </button>
        ))}
      </div>
      {upcoming.length ? (
        <section
          class="compact-music-queue"
          aria-label="Upcoming music"
        >
          <h3>Up next</h3>
          {upcoming.map((item) => (
            <div
              class="compact-music-row"
              key={item.queueItemId}
            >
              <strong>{item.title}</strong>
              <span>{item.artist}</span>
            </div>
          ))}
        </section>
      ) : null}
    </section>
  )
}
