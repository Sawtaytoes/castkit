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
import { getCompactMusicLayout } from "./compactMusicLayout.ts"
import { MusicPlayer } from "./MusicPlayer.tsx"
import { splitQueue } from "./musicPlayerModel.ts"
import { useTrackAccent } from "./useTrackAccent.ts"
import "./compactMusicPlayer.css"

/** A small music card; opening it gives the full player first claim on the composition. */
export const CompactMusicPlayer = ({
  data,
  isControlEnabled,
  onAction,
  isExpanded: isControlledExpanded,
  onExpandedChange,
  sourceNotice,
  ...playerOptions
}: ComponentProps<typeof MusicPlayer> & {
  isExpanded?: boolean
  onExpandedChange?: (isExpanded: boolean) => void
  sourceNotice?: string
}) => {
  const navigation = useContext(CompositionNavigation)
  const isVisible = useCompositionVisibility()
  const { isInteractive } = useDisplayProperties()
  const [isInternallyExpanded, setExpanded] =
    useState(false)
  const isExpanded =
    isControlledExpanded ?? isInternallyExpanded
  const [fit, setFit] = useState(() =>
    getCompactMusicLayout({ width: 0, height: 0 }),
  )
  const element = useRef<HTMLElement>(null)
  const release = useRef(navigation?.release)
  release.current = navigation?.release
  const expandedAtUnmount = useRef(isExpanded)
  expandedAtUnmount.current = isExpanded
  const isNavigationOwner = useRef(
    isControlledExpanded === undefined,
  )
  isNavigationOwner.current =
    isControlledExpanded === undefined
  const selectExpanded = (isOpen: boolean) => {
    const update = () => {
      setExpanded(isOpen)
      onExpandedChange?.(isOpen)
    }
    if (navigation && isNavigationOwner.current)
      navigation.navigate(update, isOpen)
    else update()
  }
  useLayoutEffect(
    () => () => {
      if (
        isNavigationOwner.current &&
        expandedAtUnmount.current
      )
        release.current?.()
    },
    [],
  )
  useLayoutEffect(() => {
    if (
      isExpanded &&
      (!isVisible ||
        (isNavigationOwner.current &&
          navigation?.isDetailFocused === false))
    ) {
      setExpanded(false)
      onExpandedChange?.(false)
    }
    if (
      !isVisible &&
      isExpanded &&
      isNavigationOwner.current
    )
      release.current?.()
  }, [isVisible, navigation?.isDetailFocused, isExpanded])
  useLayoutEffect(() => {
    const container = element.current
    if (!container || !isVisible || isExpanded) return
    const measure = () => {
      const style = getComputedStyle(container)
      const next = getCompactMusicLayout({
        width: Number.parseFloat(style.width),
        height: Number.parseFloat(style.height),
      })
      setFit((previous) =>
        JSON.stringify(previous) === JSON.stringify(next)
          ? previous
          : next,
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
  const accent = useTrackAccent({
    trackKey: data?.current?.queueItemId ?? "",
    artworkPath: data?.current?.artworkPath,
  })
  const artwork = safeMediaUrl(data?.current?.artworkPath)
  const [failedArtwork, setFailedArtwork] =
    useState<string>()
  const isPlaying = data?.player?.state === "playing"
  const upcoming = splitQueue({
    items: data?.queue?.items ?? [],
    currentIndex: data?.queue?.currentIndex,
    playedRowCount: 0,
  }).upcoming.slice(0, fit.queueCount)
  if (isExpanded)
    return (
      <div class="compact-music-detail">
        <button
          type="button"
          class="compact-music-back"
          onClick={() => selectExpanded(false)}
        >
          <Icon path={ICON_PATHS.chevronLeft} size="20px" />
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
      data-layout={fit.isWide ? "wide" : "stacked"}
      data-is-roomy={String(fit.isRoomy)}
      data-has-queue={String(upcoming.length > 0)}
      style={{
        ...(accent ? { "--music-accent": accent } : {}),
        "--compact-primary-width": `${fit.primaryWidth}px`,
        "--compact-art-size": `${fit.artworkSize}px`,
        "--compact-queue-columns": fit.queueColumns,
        "--compact-queue-rows": fit.queueRows,
        "--compact-row-height": `${fit.queueRowHeight}px`,
      }}
    >
      <div class="compact-music-primary">
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
              {sourceNotice ??
                (isPlaying
                  ? "Now playing"
                  : data?.player?.state === "paused"
                    ? "Paused"
                    : "Music")}
            </small>
            <strong>
              {data?.current?.title || "Nothing playing"}
            </strong>
            <span>
              {data?.current?.artist ||
                data?.player?.name ||
                "Choose music in the full player"}
            </span>
            {data?.current?.album ? (
              <em>{data.current.album}</em>
            ) : null}
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
              [
                "Next",
                ICON_PATHS.next,
                "next",
                !data?.queue,
              ],
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
      </div>
      {upcoming.length ? (
        <section
          class="compact-music-queue"
          aria-label="Upcoming music"
        >
          <h3>Up next</h3>
          <div class="compact-music-queue-grid">
            {upcoming.map((item, index) => (
              <button
                type="button"
                title={`Play ${item.title}`}
                disabled={
                  !isControlEnabled || !item.isAvailable
                }
                onClick={() =>
                  void onAction("play_item", {
                    queueItemId: item.queueItemId,
                  })
                }
                class="compact-music-row"
                key={item.queueItemId}
              >
                <span class="compact-music-row-number">
                  {index + 1}
                </span>
                <QueueArtwork path={item.artworkPath} />
                <span class="compact-music-row-meta">
                  <strong>{item.title}</strong>
                  <span>{item.artist}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  )
}

/** Keep failed artwork local to its queue item and retain the same row geometry. */
const QueueArtwork = ({ path }: { path?: string }) => {
  const source = safeMediaUrl(path)
  const [failed, setFailed] = useState<string>()
  return source && source !== failed ? (
    <img
      class="compact-music-row-art"
      src={source}
      alt=""
      data-castkit-media-readiness="optional"
      onError={() => setFailed(source)}
    />
  ) : (
    <span class="compact-music-row-art" aria-hidden="true">
      <Icon path={ICON_PATHS.note} size="20px" />
    </span>
  )
}
