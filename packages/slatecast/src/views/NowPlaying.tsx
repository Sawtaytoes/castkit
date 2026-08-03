import { useEffect, useState } from "preact/hooks"
import { extractAccentColor } from "../accentColor.ts"
import { formatTime } from "../formatTime.ts"
import { ICON_PATHS, Icon } from "../Icon.tsx"
import {
  device,
  livePositionSeconds,
  nowPlaying,
  playNext,
  playPrevious,
  scrubPositionSeconds,
  seekTo,
  setVolume,
  toggleMute,
  togglePlayPause,
} from "../state.ts"

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
        onClick={playPrevious}
      >
        <Icon path={ICON_PATHS.previous} />
      </button>
      <button
        type="button"
        class="play-pause"
        aria-label={data?.isPlaying ? "Pause" : "Play"}
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
      {artworkUrl ? (
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
