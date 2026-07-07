import { useEffect, useState } from "preact/hooks"
import { extractAccentColor } from "../accentColor.ts"
import {
  device,
  livePositionSeconds,
  nowPlaying,
  scrubPositionSeconds,
  sendCommand,
} from "../state.ts"

const formatTime = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(whole / 60)
  const remainder = whole % 60
  return `${minutes}:${String(remainder).padStart(2, "0")}`
}

/**
 * Inline SVG icons — emoji/symbol glyphs (⏮ ⏸ 🔊) render as tofu on minimal
 * kiosk OS fonts (WPE/cage ship no emoji font), so controls draw their own.
 */
const Icon = ({
  path,
  size = "1em",
}: {
  path: string
  size?: string
}) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="currentColor"
    aria-hidden="true"
  >
    <path d={path} />
  </svg>
)

const ICON_PATHS = {
  previous: "M6 6h2v12H6V6zm12 0v12l-8.5-6L18 6z",
  play: "M8 5v14l11-7L8 5z",
  pause: "M6 5h4v14H6V5zm8 0h4v14h-4V5z",
  next: "M16 6h2v12h-2V6zM6 6l8.5 6L6 18V6z",
  volume:
    "M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z",
  muted:
    "M3 9v6h4l5 5V4L7 9H3zm18.6 6.7-1.4 1.4L17 13.9l-3.2 3.2-1.4-1.4 3.2-3.2-3.2-3.2 1.4-1.4L17 11.1l3.2-3.2 1.4 1.4-3.2 3.2 3.2 3.2z",
} as const

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

  return (
    <div class="seek">
      <span class="seek-time">{formatTime(position)}</span>
      <div
        class={`seek-track${isInteractive ? " interactive" : ""}`}
        onPointerDown={
          isInteractive
            ? (event) => {
                ;(
                  event.currentTarget as HTMLElement
                ).setPointerCapture(event.pointerId)
                scrubPositionSeconds.value =
                  positionFromEvent(event)
              }
            : undefined
        }
        onPointerMove={
          isInteractive
            ? (event) => {
                if (scrubPositionSeconds.value !== null) {
                  scrubPositionSeconds.value =
                    positionFromEvent(event)
                }
              }
            : undefined
        }
        onPointerUp={
          isInteractive
            ? (event) => {
                const target = positionFromEvent(event)
                scrubPositionSeconds.value = null
                sendCommand({
                  action: "seek",
                  value: target,
                })
              }
            : undefined
        }
      >
        <div
          class="seek-fill"
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
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
        onClick={() => sendCommand({ action: "previous" })}
      >
        <Icon path={ICON_PATHS.previous} />
      </button>
      <button
        type="button"
        class="play-pause"
        aria-label={data?.isPlaying ? "Pause" : "Play"}
        onClick={() =>
          sendCommand({ action: "play_pause" })
        }
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
        onClick={() => sendCommand({ action: "next" })}
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
        onClick={() =>
          sendCommand({ action: "volume_mute" })
        }
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
        onChange={(event) =>
          sendCommand({
            action: "volume_set",
            value:
              Number(
                (event.currentTarget as HTMLInputElement)
                  .value,
              ) / 100,
          })
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
        <div class="artwork placeholder">♪</div>
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
