import type { JSX } from "preact"
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "preact/hooks"
import { formatTime } from "../formatTime.ts"
import { ICON_PATHS, Icon } from "../Icon.tsx"
import { useCompositionVisibility } from "../platform/CompositionVisibility.ts"
import { safeMediaUrl } from "../platform/protocol.ts"
import {
  countUpcomingRows,
  findCurrentLyricIndex,
  type MusicPlayerData,
  type MusicQueueItem,
  readLivePositionSeconds,
  readSeekSeconds,
  resampleWaveform,
  splitQueue,
} from "./musicPlayerModel.ts"
import { useTrackAccent } from "./useTrackAccent.ts"

/** Queue row height and section label height, in pixels; the CSS uses the same. */
const ROW_HEIGHT = 46
const LABEL_HEIGHT = 26
/** One waveform bar plus its gap, in pixels. */
const BAR_PITCH = 3

type MusicAction = (
  action: string,
  payload?: Record<string, unknown>,
) => Promise<void>

/** Re-render on a timer while `isActive`, for a position that moves by itself. */
const useNowMs = ({
  isActive,
  intervalMs,
}: {
  isActive: boolean
  intervalMs: number
}) => {
  const isVisible = useCompositionVisibility()
  const [nowMs, setNowMs] = useState(Date.now())
  useEffect(() => {
    setNowMs(Date.now())
    if (!isActive || !isVisible) {
      return undefined
    }
    const timer = setInterval(
      () => setNowMs(Date.now()),
      intervalMs,
    )
    return () => clearInterval(timer)
  }, [isActive, intervalMs, isVisible])
  return isVisible ? Date.now() : nowMs
}

/** An element's content box, kept current as the panel resizes. */
const useElementSize = <
  ElementType extends HTMLElement,
>() => {
  const isVisible = useCompositionVisibility()
  const reference = useRef<ElementType>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const element = reference.current
    if (!element) {
      return undefined
    }
    const measure = () => {
      const next = {
        width: element.clientWidth,
        height: element.clientHeight,
      }
      setSize((previous) =>
        previous.width === next.width &&
        previous.height === next.height
          ? previous
          : next,
      )
    }
    measure()
    if (!isVisible) return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [isVisible])
  return { reference, size }
}

const Artwork = ({
  path,
  className,
}: {
  path: string | undefined
  className: string
}) => {
  const source = safeMediaUrl(path)
  // A picture that fails to load shows the note, not the browser's broken-image mark.
  const [failedSource, setFailedSource] = useState<string>()
  return source && source !== failedSource ? (
    <img
      data-castkit-media-readiness="optional"
      class={className}
      src={source}
      alt=""
      onError={() => setFailedSource(source)}
    />
  ) : (
    <div class={`${className} music-art-empty`}>
      <Icon path={ICON_PATHS.note} size="40%" />
    </div>
  )
}

const IconButton = ({
  label,
  path,
  isOn = false,
  isPrimary = false,
  isDisabled,
  onClick,
}: {
  label: string
  path: string
  isOn?: boolean
  isPrimary?: boolean
  isDisabled: boolean
  onClick: () => void
}) => (
  <button
    type="button"
    class={`music-button${isPrimary ? " music-button-primary" : ""}${isOn ? " is-on" : ""}`}
    aria-label={label}
    aria-pressed={isPrimary ? undefined : isOn}
    title={label}
    disabled={isDisabled}
    onClick={onClick}
  >
    <Icon path={path} size={isPrimary ? "28px" : "22px"} />
  </button>
)

/**
 * Favorite, Previous, Play/Pause, and Next. Play/Pause needs only a player:
 * Music Assistant plays a player that has no queue yet through the player's
 * own command. The rest act on the queue, so they wait for one.
 */
const Transport = ({
  data,
  isControlEnabled,
  onAction,
}: {
  data: MusicPlayerData
  isControlEnabled: boolean
  onAction: MusicAction
}) => {
  const isPlaying = data.player?.state === "playing"
  const isQueueDisabled = !isControlEnabled || !data.queue
  return (
    <div class="music-transport">
      <IconButton
        label={
          data.current?.isFavorite
            ? "Remove from favorites"
            : "Add to favorites"
        }
        path={
          data.current?.isFavorite
            ? ICON_PATHS.favorite
            : ICON_PATHS.favoriteOutline
        }
        isOn={data.current?.isFavorite === true}
        isDisabled={isQueueDisabled || !data.current}
        onClick={() =>
          void onAction("favorite", {
            isFavorite: !data.current?.isFavorite,
          })
        }
      />
      <IconButton
        label="Previous track"
        path={ICON_PATHS.previous}
        isDisabled={isQueueDisabled}
        onClick={() => void onAction("previous")}
      />
      <IconButton
        label={isPlaying ? "Pause" : "Play"}
        path={
          isPlaying ? ICON_PATHS.pause : ICON_PATHS.play
        }
        isPrimary
        isDisabled={!isControlEnabled || !data.player}
        onClick={() => void onAction("play_pause")}
      />
      <IconButton
        label="Next track"
        path={ICON_PATHS.next}
        isDisabled={isQueueDisabled}
        onClick={() => void onAction("next")}
      />
    </div>
  )
}

/**
 * The seek bar. With a waveform it draws one bar per few pixels, colored up
 * to the position; without one it is a plain progress line. Pressing any
 * point seeks there; dragging moves the position and the time label with
 * the pointer and seeks once, on release.
 */
const SeekBar = ({
  data,
  positionSeconds,
  isControlEnabled,
  onAction,
}: {
  data: MusicPlayerData
  positionSeconds: number
  isControlEnabled: boolean
  onAction: MusicAction
}) => {
  const { reference, size } =
    useElementSize<HTMLDivElement>()
  const [hoverFraction, setHoverFraction] = useState<
    number | undefined
  >(undefined)
  const [dragFraction, setDragFraction] = useState<
    number | undefined
  >(undefined)
  const dragPointerId = useRef<number | null>(null)
  const duration = data.current?.durationSeconds ?? 0
  const isSeekable = isControlEnabled && duration > 0
  const isDragging = dragFraction !== undefined
  const shownSeconds = isDragging
    ? readSeekSeconds({
        fraction: dragFraction,
        durationSeconds: duration,
      })
    : positionSeconds
  const fraction =
    duration > 0
      ? Math.min(1, Math.max(0, positionSeconds / duration))
      : 0
  const bars = resampleWaveform({
    values: data.waveform ?? [],
    barCount: Math.floor(size.width / BAR_PITCH),
  })
  useEffect(() => {
    dragPointerId.current = null
    setDragFraction(undefined)
    setHoverFraction(undefined)
  }, [data.current?.queueItemId, isSeekable])
  const labelFraction = isSeekable
    ? (dragFraction ?? hoverFraction)
    : undefined
  const handleFraction = dragFraction ?? fraction
  const readFraction = (
    event: JSX.TargetedPointerEvent<HTMLDivElement>,
  ) => {
    const box = event.currentTarget.getBoundingClientRect()
    return box.width > 0
      ? Math.min(
          1,
          Math.max(
            0,
            (event.clientX - box.left) / box.width,
          ),
        )
      : 0
  }
  const endDrag = () => {
    dragPointerId.current = null
    setDragFraction(undefined)
  }
  return (
    <div class="music-seek">
      <div
        ref={reference}
        class={`music-wave${bars.length ? "" : " is-plain"}${isSeekable ? " is-seekable" : ""}${isDragging ? " is-dragging" : ""}`}
        role="slider"
        aria-label="Seek"
        aria-disabled={!isSeekable}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(shownSeconds)}
        aria-valuetext={`${formatTime(shownSeconds)} of ${formatTime(duration)}`}
        tabIndex={isSeekable ? 0 : -1}
        onPointerDown={(event) => {
          if (
            !isSeekable ||
            event.button !== 0 ||
            dragPointerId.current !== null
          ) {
            return
          }
          event.preventDefault()
          dragPointerId.current = event.pointerId
          event.currentTarget.setPointerCapture(
            event.pointerId,
          )
          setDragFraction(readFraction(event))
        }}
        onPointerMove={(event) => {
          if (dragPointerId.current === event.pointerId) {
            setDragFraction(readFraction(event))
            return
          }
          if (event.pointerType === "mouse") {
            setHoverFraction(readFraction(event))
          }
        }}
        onPointerUp={(event) => {
          if (dragPointerId.current !== event.pointerId) {
            return
          }
          if (!isSeekable) {
            endDrag()
            return
          }
          const target = readSeekSeconds({
            fraction: readFraction(event),
            durationSeconds: duration,
          })
          const box =
            event.currentTarget.getBoundingClientRect()
          setHoverFraction(
            event.pointerType === "mouse" &&
              event.clientX >= box.left &&
              event.clientX <= box.right &&
              event.clientY >= box.top &&
              event.clientY <= box.bottom
              ? readFraction(event)
              : undefined,
          )
          endDrag()
          void onAction("seek", {
            positionSeconds: target,
          })
        }}
        onPointerCancel={() => {
          endDrag()
          setHoverFraction(undefined)
        }}
        onLostPointerCapture={endDrag}
        onPointerLeave={() => setHoverFraction(undefined)}
        onKeyDown={(event) => {
          if (
            !isSeekable ||
            !["ArrowLeft", "ArrowRight"].includes(event.key)
          ) {
            return
          }
          event.preventDefault()
          void onAction("seek", {
            positionSeconds: Math.min(
              duration,
              Math.max(
                0,
                Math.round(positionSeconds) +
                  (event.key === "ArrowLeft" ? -10 : 10),
              ),
            ),
          })
        }}
      >
        {bars.length ? (
          bars.map((level, index) => (
            <i
              key={index}
              class={[
                index / bars.length < fraction
                  ? "is-played"
                  : "",
                labelFraction !== undefined &&
                index / bars.length >=
                  Math.min(fraction, labelFraction) &&
                index / bars.length <
                  Math.max(fraction, labelFraction)
                  ? "is-preview"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{
                height: `${Math.max(6, Math.round(level * 100))}%`,
              }}
            />
          ))
        ) : (
          <span
            class="music-progress"
            style={{ width: `${fraction * 100}%` }}
          />
        )}
        {labelFraction !== undefined ? (
          <>
            {!bars.length ? (
              <span
                class="music-seek-preview"
                aria-hidden="true"
                style={{
                  left: `${Math.min(fraction, labelFraction) * 100}%`,
                  width: `${Math.abs(fraction - labelFraction) * 100}%`,
                }}
              />
            ) : null}
            <span
              class="music-seek-target"
              aria-hidden="true"
              style={{ left: `${labelFraction * 100}%` }}
            />
          </>
        ) : null}
        {isSeekable ? (
          <span
            class="music-seek-handle"
            aria-hidden="true"
            style={{
              "--seek-position": `${handleFraction * 100}%`,
            }}
          />
        ) : null}
        {labelFraction !== undefined && isSeekable ? (
          <span
            class="music-seek-hover"
            style={{ left: `${labelFraction * 100}%` }}
          >
            {formatTime(
              readSeekSeconds({
                fraction: labelFraction,
                durationSeconds: duration,
              }),
            )}
          </span>
        ) : null}
      </div>
      <div class="music-times">
        <span>{formatTime(shownSeconds)}</span>
        <span>
          {duration > 0 ? formatTime(duration) : ""}
        </span>
      </div>
    </div>
  )
}

const Volume = ({
  data,
  isControlEnabled,
  onAction,
}: {
  data: MusicPlayerData
  isControlEnabled: boolean
  onAction: MusicAction
}) => {
  const reported = data.player?.volume
  const [draft, setDraft] = useState<number | undefined>(
    undefined,
  )
  useEffect(() => setDraft(undefined), [reported])
  const volume = draft ?? reported ?? 0
  return (
    <label class="music-volume">
      <Icon
        path={
          data.player?.isMuted || volume === 0
            ? ICON_PATHS.muted
            : ICON_PATHS.volume
        }
        size="20px"
      />
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={volume}
        aria-label="Volume"
        disabled={
          !isControlEnabled || reported === undefined
        }
        style={{ "--music-volume": `${volume}%` }}
        onInput={(event) =>
          setDraft(Number(event.currentTarget.value))
        }
        onChange={(event) =>
          void onAction("set_volume", {
            volume: Number(event.currentTarget.value),
          })
        }
      />
      <span class="music-volume-value">
        {reported === undefined ? "" : Math.round(volume)}
      </span>
    </label>
  )
}

/**
 * The player the view controls, and a menu to pick another or to sync
 * speakers with it. Sync is offered only where Music Assistant can group
 * the player; otherwise its members are listed as status.
 */
const PlayerChip = ({
  data,
  isControlEnabled,
  onAction,
}: {
  data: MusicPlayerData
  isControlEnabled: boolean
  onAction: MusicAction
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const player = data.player
  const syncedCount =
    player?.members.filter((member) => member.isMember)
      .length ?? 0
  const hasMenu =
    data.players.length > 1 ||
    (player?.members.length ?? 0) > 0
  return (
    <div class="music-player-picker">
      <button
        type="button"
        class="music-chip"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        disabled={!hasMenu}
        onClick={() => setIsOpen(!isOpen)}
      >
        <Icon path={ICON_PATHS.speakers} size="18px" />
        <span class="music-chip-name">
          {player?.name ?? "No player"}
        </span>
        {syncedCount > 0 ? (
          <span class="music-chip-count">
            +{syncedCount}
          </span>
        ) : null}
      </button>
      {isOpen ? (
        <div class="music-menu" role="menu">
          {data.players.length > 1 ? (
            <>
              <div class="music-menu-label">Control</div>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={data.isAutomaticSelection}
                class="music-menu-item"
                disabled={!isControlEnabled}
                onClick={() => {
                  setIsOpen(false)
                  void onAction("select_player", {
                    playerId: "automatic",
                  })
                }}
              >
                <span class="music-menu-check">
                  {data.isAutomaticSelection ? (
                    <Icon
                      path={ICON_PATHS.check}
                      size="16px"
                    />
                  ) : null}
                </span>
                Whichever is playing
              </button>
              {data.players.map((choice) => {
                const isChosen =
                  !data.isAutomaticSelection &&
                  choice.id === player?.id
                return (
                  <button
                    key={choice.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={isChosen}
                    class="music-menu-item"
                    disabled={!isControlEnabled}
                    onClick={() => {
                      setIsOpen(false)
                      void onAction("select_player", {
                        playerId: choice.id,
                      })
                    }}
                  >
                    <span class="music-menu-check">
                      {isChosen ? (
                        <Icon
                          path={ICON_PATHS.check}
                          size="16px"
                        />
                      ) : null}
                    </span>
                    {choice.name}
                    <span class="music-menu-state">
                      {choice.state === "playing"
                        ? "Playing"
                        : choice.state === "unavailable"
                          ? "Offline"
                          : ""}
                    </span>
                  </button>
                )
              })}
            </>
          ) : null}
          {player?.members.length ? (
            <>
              <div class="music-menu-label">
                {player.isMemberControlAvailable
                  ? "Sync speakers"
                  : "Speakers in this group"}
              </div>
              {player.members.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={member.isMember}
                  class="music-menu-item"
                  disabled={
                    !isControlEnabled ||
                    !player.isMemberControlAvailable ||
                    !member.isAvailable
                  }
                  onClick={() =>
                    void onAction("set_member", {
                      playerId: member.id,
                      isMember: !member.isMember,
                    })
                  }
                >
                  <span class="music-menu-check">
                    {member.isMember ? (
                      <Icon
                        path={ICON_PATHS.check}
                        size="16px"
                      />
                    ) : null}
                  </span>
                  {member.name}
                  <span class="music-menu-state">
                    {member.isAvailable ? "" : "Offline"}
                  </span>
                </button>
              ))}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

const QueueRow = ({
  item,
  kind,
  isControlEnabled,
  onAction,
}: {
  item: MusicQueueItem
  kind: "played" | "current" | "upcoming"
  isControlEnabled: boolean
  onAction: MusicAction
}) => (
  <button
    type="button"
    class={`music-row is-${kind}`}
    aria-current={kind === "current" ? "true" : undefined}
    disabled={
      !isControlEnabled ||
      kind === "current" ||
      !item.isAvailable
    }
    title={
      kind === "current" ? undefined : `Play ${item.title}`
    }
    onClick={() =>
      void onAction("play_item", {
        queueItemId: item.queueItemId,
      })
    }
  >
    <Artwork
      path={item.artworkPath}
      className="music-row-art"
    />
    <span class="music-row-text">
      <span class="music-row-title">{item.title}</span>
      <span class="music-row-artist">{item.artist}</span>
    </span>
    <span class="music-row-duration">
      {item.durationSeconds === undefined
        ? ""
        : formatTime(item.durationSeconds)}
    </span>
  </button>
)

const QueueList = ({
  data,
  playedRowCount,
  isControlEnabled,
  onAction,
}: {
  data: MusicPlayerData
  playedRowCount: number
  isControlEnabled: boolean
  onAction: MusicAction
}) => {
  const { reference, size } =
    useElementSize<HTMLDivElement>()
  const queue = data.queue
  const { played, current, upcoming } = splitQueue({
    items: queue?.items ?? [],
    currentIndex: queue?.currentIndex,
    playedRowCount,
  })
  const upcomingCount = countUpcomingRows({
    listHeight: size.height,
    rowHeight: ROW_HEIGHT,
    labelHeight: LABEL_HEIGHT,
    playedRowCount: played.length,
    hasCurrent: current !== undefined,
  })
  const remaining =
    queue && queue.currentIndex !== undefined
      ? Math.max(
          0,
          queue.itemCount - queue.currentIndex - 1,
        )
      : upcoming.length
  return (
    <div ref={reference} class="music-queue">
      {!queue?.items.length ? (
        <div class="music-empty">The queue is empty.</div>
      ) : (
        <>
          {played.length ? (
            <div class="music-label">Played</div>
          ) : null}
          {played.map((item) => (
            <QueueRow
              key={item.queueItemId}
              item={item}
              kind="played"
              isControlEnabled={isControlEnabled}
              onAction={onAction}
            />
          ))}
          {current ? (
            <>
              <div class="music-label">Now playing</div>
              <QueueRow
                item={current}
                kind="current"
                isControlEnabled={isControlEnabled}
                onAction={onAction}
              />
            </>
          ) : null}
          <div class="music-label">
            Up next{" "}
            <span class="music-label-count">
              {remaining}
            </span>
          </div>
          {upcoming.slice(0, upcomingCount).map((item) => (
            <QueueRow
              key={item.queueItemId}
              item={item}
              kind="upcoming"
              isControlEnabled={isControlEnabled}
              onAction={onAction}
            />
          ))}
        </>
      )}
    </div>
  )
}

/**
 * Lyrics for the current track. Synced lyrics follow the position and keep
 * the sung line in the middle; selecting a line seeks to it. Plain lyrics
 * carry no times, so they scroll and do not seek.
 */
const LyricsPane = ({
  data,
  positionSeconds,
  isControlEnabled,
  onAction,
}: {
  data: MusicPlayerData
  positionSeconds: number
  isControlEnabled: boolean
  onAction: MusicAction
}) => {
  const lyrics = data.lyrics
  const listReference = useRef<HTMLDivElement>(null)
  const currentIndex = lyrics?.isSynced
    ? findCurrentLyricIndex({
        lines: lyrics.lines,
        positionSeconds,
      })
    : -1
  useEffect(() => {
    const list = listReference.current
    const line = list?.querySelector<HTMLElement>(
      ".music-lyric.is-current",
    )
    if (!list || !line) {
      return
    }
    list.scrollTo({
      top:
        line.offsetTop -
        list.clientHeight / 2 +
        line.offsetHeight / 2,
      behavior: "smooth",
    })
  }, [currentIndex])
  if (!lyrics) {
    return (
      <div class="music-empty">
        This track has no lyrics.
      </div>
    )
  }
  return (
    <div
      ref={listReference}
      class={`music-lyrics${lyrics.isSynced ? " is-synced" : ""}`}
    >
      {lyrics.lines.map((line, index) =>
        lyrics.isSynced &&
        line.startSeconds !== undefined ? (
          <button
            key={index}
            type="button"
            class={`music-lyric${index === currentIndex ? " is-current" : index < currentIndex ? " is-sung" : ""}`}
            disabled={!isControlEnabled}
            onClick={() =>
              void onAction("seek", {
                positionSeconds: Math.floor(
                  line.startSeconds ?? 0,
                ),
              })
            }
          >
            {line.text || "· · ·"}
          </button>
        ) : (
          <p key={index} class="music-lyric is-plain">
            {line.text || " "}
          </p>
        ),
      )}
    </div>
  )
}

/**
 * A music player for a mid-sized display: the player beside its queue, or
 * a wide waveform above it. Built for a mouse as much as for touch; every
 * control is a real button.
 */
export const MusicPlayer = ({
  data,
  layout,
  isLyricsTabVisible,
  playedRowCount,
  isControlEnabled,
  onAction,
  initialTab = "queue",
}: {
  data: MusicPlayerData | null
  initialTab?: "queue" | "lyrics"
  layout: "side-by-side" | "wide-waveform"
  isLyricsTabVisible: boolean
  playedRowCount: number
  isControlEnabled: boolean
  onAction: MusicAction
}) => {
  const [tab, setTab] = useState(initialTab)
  const [error, setError] = useState<string | undefined>(
    undefined,
  )
  const isPlaying = data?.player?.state === "playing"
  const nowMs = useNowMs({
    isActive: isPlaying,
    intervalMs: 250,
  })
  const current = data?.current
  const trackKey = current?.queueItemId ?? ""
  const accent = useTrackAccent({
    trackKey,
    artworkPath: current?.artworkPath,
  })
  useEffect(() => {
    if (!error) {
      return undefined
    }
    const timer = setTimeout(
      () => setError(undefined),
      4000,
    )
    return () => clearTimeout(timer)
  }, [error])
  const hasLyrics = Boolean(data?.lyrics)
  const visibleTab =
    tab === "lyrics" && isLyricsTabVisible && hasLyrics
      ? "lyrics"
      : "queue"
  if (!data) {
    return (
      <section class="music-player">
        <div class="music-empty">
          Waiting for the music player…
        </div>
      </section>
    )
  }
  const act: MusicAction = (action, payload) =>
    onAction(action, payload).catch((failure: unknown) =>
      setError(
        failure instanceof Error
          ? failure.message
          : "That did not work.",
      ),
    )
  const positionSeconds = readLivePositionSeconds({
    data,
    nowMs,
  })
  const controls = {
    data,
    isControlEnabled,
    onAction: act,
  }
  const title = (
    <div class="music-title">
      <div class="music-track" title={current?.title}>
        {current?.title ?? "Nothing playing"}
      </div>
      <div class="music-artist" title={current?.artist}>
        {[
          current?.artist,
          layout === "wide-waveform"
            ? current?.album
            : undefined,
        ]
          .filter(Boolean)
          .join(" · ")}
      </div>
    </div>
  )
  const side = (
    <section class="music-side">
      <div class="music-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={visibleTab === "queue"}
          class="music-tab"
          onClick={() => setTab("queue")}
        >
          Queue
        </button>
        {isLyricsTabVisible ? (
          <button
            type="button"
            role="tab"
            aria-selected={visibleTab === "lyrics"}
            class="music-tab"
            disabled={!hasLyrics}
            title={
              hasLyrics
                ? undefined
                : "This track has no lyrics"
            }
            onClick={() => setTab("lyrics")}
          >
            Lyrics
          </button>
        ) : null}
        <span class="music-tabs-note">
          {visibleTab === "lyrics"
            ? data.lyrics?.isSynced
              ? isControlEnabled
                ? "Select a line to seek"
                : "Synced"
              : "Not synced"
            : data.queue
              ? `${data.queue.itemCount} tracks`
              : ""}
        </span>
      </div>
      {visibleTab === "lyrics" ? (
        <LyricsPane
          {...controls}
          positionSeconds={positionSeconds}
        />
      ) : (
        <QueueList
          {...controls}
          playedRowCount={playedRowCount}
        />
      )}
    </section>
  )
  return (
    <section
      class="music-player"
      style={
        accent ? { "--music-accent": accent } : undefined
      }
    >
      <div class={`music-layout is-${layout}`}>
        {layout === "wide-waveform" ? (
          <>
            <header class="music-header">
              <Artwork
                path={current?.artworkPath}
                className="music-art"
              />
              <div class="music-header-main">
                {title}
                <div class="music-header-controls">
                  <Transport {...controls} />
                  <Volume {...controls} />
                  <PlayerChip {...controls} />
                </div>
              </div>
            </header>
            <SeekBar
              {...controls}
              positionSeconds={positionSeconds}
            />
            {side}
          </>
        ) : (
          <>
            <section class="music-main">
              <div class="music-art-frame">
                <Artwork
                  path={current?.artworkPath}
                  className="music-art"
                />
              </div>
              {title}
              <SeekBar
                {...controls}
                positionSeconds={positionSeconds}
              />
              <Transport {...controls} />
              <Volume {...controls} />
              <PlayerChip {...controls} />
            </section>
            {side}
          </>
        )}
      </div>
      {error ? (
        <div class="music-error" role="alert">
          {error}
        </div>
      ) : null}
    </section>
  )
}
