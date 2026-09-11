import type { QueueItem } from "@castkit/shared/viewData/types"
import { useEffect, useRef, useState } from "preact/hooks"
import { extractAccentColor } from "../accentColor.ts"
import { formatTime } from "../formatTime.ts"
import { ICON_PATHS, Icon } from "../Icon.tsx"
import {
  device,
  livePositionSeconds,
  nextQueueItem,
  nowPlaying,
  playNext,
  playPrevious,
  scrubPositionSeconds,
  seekTo,
  setVolume,
  toggleMute,
  togglePlayPause,
} from "../state.ts"

/**
 * Movement under this many pixels is a tap, not a drag. A finger never lands
 * perfectly still, so without a slop band every tap on the artwork would also
 * arm the swipe hint for a frame.
 */
const DRAG_SLOP_PIXELS = 8

/**
 * How far the artwork must travel before releasing it changes track, as a
 * fraction of the artwork's own width. Short enough to reach with one thumb on
 * the 480x320 panel, long enough that a clumsy tap cannot reach it.
 */
const TRACK_CHANGE_RATIO = 0.32

/**
 * The furthest the artwork can travel, as a fraction of its width. The rubber
 * band approaches this and never passes it, so the card cannot be flung off the
 * panel and the growing resistance tells the finger it has gone far enough.
 */
const DRAG_LIMIT_RATIO = 0.75

/**
 * Follow the finger one to one at first, then give progressively less. `tanh`
 * is the whole rubber band: it is linear near zero and flattens to `limit`.
 */
const rubberBand = ({
  distance,
  limit,
}: {
  distance: number
  limit: number
}) =>
  limit <= 0
    ? 0
    : Math.sign(distance) *
      limit *
      Math.tanh(Math.abs(distance) / limit)

type DragState = {
  pointerId: number
  startX: number
  /** Raw finger travel; what the commit distance is measured against. */
  distanceX: number
  /** Rubber-banded travel; what the artwork is actually drawn at. */
  offsetX: number
  isDragging: boolean
}

/** One cell of the artwork rail: real art when known, a glyph when not. */
const ArtworkSlot = ({
  item,
  position,
  placeholderIcon,
}: {
  item?: QueueItem | null
  position: "previous" | "current" | "next"
  placeholderIcon: string
}) => (
  <div class={`artwork-slot is-${position}`}>
    {item?.artworkPath ? (
      <img
        class="artwork"
        src={item.artworkPath}
        alt=""
        draggable={false}
      />
    ) : (
      <div class="artwork placeholder">
        <Icon path={placeholderIcon} size="1em" />
      </div>
    )}
  </div>
)

/**
 * The artwork, as a control.
 *
 * A tap toggles play and pause — the owner reaches for the picture, not the
 * small transport button under it. A drag slides the rail towards the
 * neighbouring track and names it at the top of the panel; releasing past
 * {@link TRACK_CHANGE_RATIO} changes track, and bringing it back to the middle
 * cancels.
 *
 * Only the next track can carry a name. Home Assistant's Music Assistant
 * integration reports the current queue item and the one after it, and nothing
 * before it, so the previous side is a labelled glyph rather than a wrong
 * title. See `nextQueueItem`.
 */
const Artwork = () => {
  const data = nowPlaying.value
  const next = nextQueueItem.value
  const frame = useRef<HTMLButtonElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)

  const width = frame.current?.clientWidth ?? 0
  const commitDistance = width * TRACK_CHANGE_RATIO
  const isDragging = drag?.isDragging ?? false
  const isTowardsNext = (drag?.distanceX ?? 0) < 0
  const isArmed =
    isDragging &&
    commitDistance > 0 &&
    Math.abs(drag?.distanceX ?? 0) >= commitDistance

  const endDrag = () => {
    setDrag(null)
  }

  return (
    <>
      {isDragging ? (
        <div
          class={`swipe-hint${isArmed ? " is-armed" : ""}`}
          aria-live="polite"
        >
          <Icon
            path={
              isTowardsNext
                ? ICON_PATHS.next
                : ICON_PATHS.previous
            }
            size="1em"
          />
          <span class="swipe-hint-label">
            {isTowardsNext ? "Next Song" : "Previous Song"}
          </span>
          {isTowardsNext && next ? (
            <span class="swipe-hint-track">
              {next.title}
            </span>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        ref={frame}
        class="artwork-frame"
        aria-label={`${data?.isPlaying ? "Pause" : "Play"} ${data?.title ?? ""}`.trim()}
        data-castkit-target="now-playing-artwork"
        onPointerDown={(event) => {
          ;(
            event.currentTarget as HTMLElement
          ).setPointerCapture(event.pointerId)
          setDrag({
            pointerId: event.pointerId,
            startX: event.clientX,
            distanceX: 0,
            offsetX: 0,
            isDragging: false,
          })
        }}
        onPointerMove={(event) => {
          if (!drag || event.pointerId !== drag.pointerId) {
            return
          }
          const distanceX = event.clientX - drag.startX
          setDrag({
            ...drag,
            distanceX,
            offsetX: rubberBand({
              distance: distanceX,
              limit:
                (event.currentTarget as HTMLElement)
                  .clientWidth * DRAG_LIMIT_RATIO,
            }),
            isDragging:
              drag.isDragging ||
              Math.abs(distanceX) >= DRAG_SLOP_PIXELS,
          })
        }}
        onPointerUp={(event) => {
          if (!drag || event.pointerId !== drag.pointerId) {
            return
          }
          // `hasMoved` rather than `isDragging`: by the time the finger is
          // lifted the drag is over, and the question the release asks is
          // whether it ever left the slop band.
          const { distanceX, isDragging: hasMoved } = drag
          const limit =
            (event.currentTarget as HTMLElement)
              .clientWidth * TRACK_CHANGE_RATIO
          endDrag()
          if (!hasMoved) {
            togglePlayPause()
            return
          }
          // With no layout there is no commit distance, and every drag would
          // clear a limit of zero.
          if (limit <= 0) {
            return
          }
          if (distanceX <= -limit) {
            playNext()
          } else if (distanceX >= limit) {
            playPrevious()
          }
        }}
        onPointerCancel={endDrag}
      >
        <div
          class={`artwork-rail${isDragging ? " is-dragging" : ""}`}
          style={{
            transform: `translateX(${drag?.offsetX ?? 0}px)`,
          }}
        >
          <ArtworkSlot
            position="previous"
            placeholderIcon={ICON_PATHS.previous}
          />
          <ArtworkSlot
            position="current"
            item={
              data?.artworkPath
                ? ({
                    artworkPath: data.artworkPath,
                  } as QueueItem)
                : null
            }
            placeholderIcon={ICON_PATHS.note}
          />
          <ArtworkSlot
            position="next"
            item={next}
            placeholderIcon={ICON_PATHS.next}
          />
        </div>
      </button>
    </>
  )
}

/** Drag-to-scrub seek bar; a passive progress bar on touchless devices. */
const SeekBar = ({
  isInteractive,
}: {
  isInteractive: boolean
}) => {
  const data = nowPlaying.value
  const duration = data?.durationSeconds
  const position =
    scrubPositionSeconds.value ?? livePositionSeconds.value
  if (duration === undefined || position === null) {
    return null
  }
  const fraction = Math.min(
    1,
    Math.max(0, position / duration),
  )

  const positionFromEvent = (event: PointerEvent) => {
    const track = (
      event.currentTarget as HTMLElement
    ).getBoundingClientRect()
    const ratio = Math.min(
      1,
      Math.max(
        0,
        (event.clientX - track.left) / track.width,
      ),
    )
    return ratio * duration
  }

  /*
    A seek bar is two different widgets and it was neither. Touchless it only
    reports, so it is a `progressbar`; touch-capable it is dragged, so it is a
    `slider`. Both need a name and a value — a bare `<div>` is invisible to a
    screen reader and unreachable by `getByRole(role, { name })`, which is how
    the fleet's agents are meant to drive these panels. The values are seconds,
    and `valuetext` is what actually gets announced, because "1 minute 4 seconds
    of 3 minutes 42" is the sentence and "64" is not.

    The two roles are spelled as separate literal elements rather than one
    `role={…ternary}`: a dynamic role defeats the a11y lint (it cannot tell
    which role's attributes to allow) and hides that `slider`, being
    interactive, must also be focusable.
  */
  const valueMax = Math.round(duration)
  const valueNow = Math.round(position)
  const valueText = `${formatTime(position)} of ${formatTime(duration)}`
  const trackFill = (
    <div
      class="seek-fill"
      style={{ width: `${fraction * 100}%` }}
    />
  )

  return (
    <div class="seek">
      <span class="seek-time">{formatTime(position)}</span>
      {isInteractive ? (
        <div
          role="slider"
          tabIndex={0}
          class="seek-track interactive"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={valueMax}
          aria-valuenow={valueNow}
          aria-valuetext={valueText}
          data-castkit-target="now-playing-seek"
          onPointerDown={(event) => {
            ;(
              event.currentTarget as HTMLElement
            ).setPointerCapture(event.pointerId)
            scrubPositionSeconds.value =
              positionFromEvent(event)
          }}
          onPointerMove={(event) => {
            if (scrubPositionSeconds.value !== null) {
              scrubPositionSeconds.value =
                positionFromEvent(event)
            }
          }}
          onPointerUp={(event) => {
            const target = positionFromEvent(event)
            scrubPositionSeconds.value = null
            seekTo(target)
          }}
        >
          {trackFill}
        </div>
      ) : (
        <div
          role="progressbar"
          class="seek-track"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={valueMax}
          aria-valuenow={valueNow}
          aria-valuetext={valueText}
        >
          {trackFill}
        </div>
      )}
      <span class="seek-time">{formatTime(duration)}</span>
    </div>
  )
}

const TransportRow = () => {
  const data = nowPlaying.value
  return (
    <div class="transport">
      <button
        type="button"
        aria-label="Previous track"
        data-castkit-target="now-playing-previous"
        onClick={playPrevious}
      >
        <Icon path={ICON_PATHS.previous} />
      </button>
      <button
        type="button"
        class="play-pause"
        aria-label={data?.isPlaying ? "Pause" : "Play"}
        data-castkit-target="now-playing-play-pause"
        onClick={togglePlayPause}
      >
        <Icon
          path={
            data?.isPlaying
              ? ICON_PATHS.pause
              : ICON_PATHS.play
          }
        />
      </button>
      <button
        type="button"
        aria-label="Next track"
        data-castkit-target="now-playing-next"
        onClick={playNext}
      >
        <Icon path={ICON_PATHS.next} />
      </button>
    </div>
  )
}

const VolumeRow = () => {
  const data = nowPlaying.value
  if (data?.volume === undefined) {
    return null
  }
  return (
    <div class="volume">
      <button
        type="button"
        aria-label="Mute"
        data-castkit-target="now-playing-mute"
        onClick={toggleMute}
      >
        <Icon
          path={
            data.isMuted
              ? ICON_PATHS.muted
              : ICON_PATHS.volume
          }
        />
      </button>
      <input
        type="range"
        min="0"
        max="100"
        value={Math.round(data.volume * 100)}
        aria-label="Volume"
        data-castkit-target="now-playing-volume"
        // onInput, not onChange: onChange only fires on release, so the slider
        // sat still under a moving finger. setVolume throttles the publishes.
        onInput={(event) =>
          setVolume(
            Number(
              (event.currentTarget as HTMLInputElement)
                .value,
            ) / 100,
          )
        }
      />
    </div>
  )
}

export const NowPlaying = () => {
  const data = nowPlaying.value
  const profile = device.value
  const isInteractive = profile?.hasTouch ?? false
  const isColourCapable =
    profile?.colour === "full" || profile?.colour === "e6"
  const [accent, setAccent] = useState<string | null>(null)

  const artworkUrl = data?.artworkPath
  useEffect(() => {
    if (!artworkUrl || !isColourCapable) {
      setAccent(null)
      return
    }
    let isStale = false
    extractAccentColor(artworkUrl).then((color) => {
      if (!isStale) {
        setAccent(color)
      }
    })
    return () => {
      isStale = true
    }
  }, [artworkUrl, isColourCapable])

  if (!data || (!data.title && !data.artist)) {
    return (
      <div class="idle">
        <div class="idle-title">Nothing playing</div>
        <div class="idle-label">{profile?.label}</div>
      </div>
    )
  }

  return (
    <div
      class="now-playing"
      style={accent ? { "--accent": accent } : undefined}
    >
      {isInteractive ? (
        <Artwork />
      ) : artworkUrl ? (
        <img
          class="artwork"
          src={artworkUrl}
          alt=""
          draggable={false}
        />
      ) : (
        <div class="artwork placeholder">
          <Icon path={ICON_PATHS.note} size="1em" />
        </div>
      )}
      <div class="track">
        <div class="title">{data.title}</div>
        <div class="artist">{data.artist}</div>
        {data.album ? (
          <div class="album">{data.album}</div>
        ) : null}
      </div>
      <SeekBar isInteractive={isInteractive} />
      {isInteractive ? (
        <>
          <TransportRow />
          <VolumeRow />
        </>
      ) : null}
    </div>
  )
}
