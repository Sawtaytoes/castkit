import type {
  ContractData,
  ViewPanel,
} from "@castkit/sdk/contracts"
import { useEffect, useState } from "preact/hooks"
import { AgendaView } from "./AgendaView.tsx"
import { CameraImage } from "./CameraImage.tsx"
import { useDisplayProperties } from "./displayProperties.ts"
import { EntitiesView } from "./EntitiesView.tsx"
import { safeMediaUrl } from "./protocol.ts"
import { ReportContent } from "./ReportContent.tsx"
import { TimersView } from "./TimersView.tsx"
import { WeatherView } from "./WeatherView.tsx"

const useClock = () => {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(
      () => setNow(Date.now()),
      1000,
    )
    return () => clearInterval(timer)
  }, [])
  return now
}

/** Photo presentation belongs to the view, while the selected assets belong to the channel. */
const PhotosView = ({
  data,
  settings,
  now,
}: {
  now: number
  data: ContractData["images.v1"]
  settings: Record<string, unknown>
}) => {
  const interval = Math.max(
    5,
    Number(
      settings.intervalSeconds ??
        Number(settings.photoIntervalMinutes ?? 5) * 60,
    ),
  )
  const index = Math.floor(
    now /
      ((Number.isFinite(interval) ? interval : 300) * 1000),
  )
  const image = data.images[index % data.images.length]
  if (!image) {
    return (
      <div class="platform-empty">No photos available</div>
    )
  }
  const faces = image.faces ?? []
  const focalPoint =
    faces.length && image.width && image.height
      ? `${Math.max(0, Math.min(100, (faces.reduce((total, face) => total + (face.x1 + face.x2) / 2, 0) / faces.length / image.width) * 100))}% ${Math.max(0, Math.min(100, (faces.reduce((total, face) => total + (face.y1 + face.y2) / 2, 0) / faces.length / image.height) * 100))}%`
      : "center"
  return (
    <figure class="platform-photo">
      <img
        src={safeMediaUrl(image.url)}
        alt={image.title ?? ""}
        style={{
          objectFit:
            settings.fit === "cover" ? "cover" : "contain",
          objectPosition: focalPoint,
        }}
      />
      {settings.hasCaption !== false && image.title ? (
        <figcaption>{image.title}</figcaption>
      ) : null}
    </figure>
  )
}

/** Built-in views consume typed channel values without knowing their source adapter. */
export const BuiltinView = ({
  panel,
  data,
  isControlEnabled,
  onAction,
}: {
  panel: ViewPanel
  data: unknown
  isControlEnabled: boolean
  onAction: (
    action: string,
    payload?: Record<string, unknown>,
  ) => Promise<void>
}) => {
  const now = useClock()
  const properties = useDisplayProperties()
  switch (panel.specId) {
    case "text":
      return (
        <ReportContent
          content={
            typeof panel.settings.content === "string"
              ? panel.settings.content
              : ""
          }
        />
      )
    case "ambient":
    case "clock":
      return (
        <div class="platform-clock">
          {properties.hasClockMinutes ? (
            <time dateTime={new Date(now).toISOString()}>
              {new Date(now).toLocaleTimeString(
                typeof panel.settings.locale === "string"
                  ? panel.settings.locale
                  : undefined,
                {
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: panel.settings.hour12 !== false,
                },
              )}
            </time>
          ) : null}
          <p>
            {new Date(now).toLocaleDateString([], {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
      )
    case "weather":
      return (
        <WeatherView
          data={data as ContractData["weather.v1"]}
        />
      )
    case "calendar":
    case "agenda":
      return (
        <AgendaView
          data={data as ContractData["agenda.v1"]}
          now={now}
        />
      )
    case "photo-frame":
    case "photos":
      return (
        <PhotosView
          data={data as ContractData["images.v1"]}
          settings={panel.settings}
          now={now}
        />
      )
    case "now-playing": {
      const media = data as ContractData["now-playing.v1"]
      return (
        <div class="platform-media">
          {safeMediaUrl(media.artworkPath) ? (
            <img
              alt=""
              src={safeMediaUrl(media.artworkPath)}
            />
          ) : null}
          <div>
            <p>
              {media.isPlaying ? "Now playing" : "Paused"}
            </p>
            <h2>{media.title || "Nothing playing"}</h2>
            <p>{media.artist}</p>
            {media.album ? <p>{media.album}</p> : null}
            {media.durationSeconds &&
            properties.hasClockSeconds ? (
              <progress
                aria-label="Track progress"
                value={Math.min(
                  media.durationSeconds,
                  (media.positionSeconds ?? 0) +
                    (media.isPlaying &&
                    media.positionUpdatedAtMs
                      ? Math.max(
                          0,
                          now - media.positionUpdatedAtMs,
                        ) / 1000
                      : 0),
                )}
                max={media.durationSeconds}
              />
            ) : null}
            {isControlEnabled ? (
              <div class="platform-actions">
                <button
                  type="button"
                  onClick={() =>
                    void onAction("media_previous_track", {
                      entityId: media.entityId,
                    })
                  }
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void onAction(
                      media.isPlaying
                        ? "media_pause"
                        : "media_play",
                      { entityId: media.entityId },
                    )
                  }
                >
                  {media.isPlaying ? "Pause" : "Play"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void onAction("media_next_track", {
                      entityId: media.entityId,
                    })
                  }
                >
                  Next
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )
    }
    case "queue": {
      const queue = data as ContractData["queue.v1"]
      return (
        <div class="platform-agenda">
          <h2>Queue</h2>
          {queue.items.map((item, index) => (
            <article key={`${item.title}:${index}`}>
              <span>
                {item.isCurrent ? "Playing" : index + 1}
              </span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.artist}</p>
              </div>
            </article>
          ))}
        </div>
      )
    }
    case "cameras": {
      const cameras = data as ContractData["cameras.v1"]
      return (
        <div class="platform-camera-grid">
          {cameras.cameras.map((camera) => (
            <figure key={camera.id}>
              <CameraImage
                url={camera.url}
                name={camera.name}
                isLive={camera.isLive}
              />
              <figcaption>
                {camera.name}
                {camera.isLive ? " · Live" : ""}
              </figcaption>
            </figure>
          ))}
        </div>
      )
    }
    case "points": {
      const points = data as ContractData["points.v1"]
      const isExpired =
        points.expiresAt !== undefined &&
        Date.parse(points.expiresAt) <= now
      return (
        <div class="platform-clock">
          <h2>{points.name}</h2>
          {!isExpired && points.awarded !== undefined ? (
            <strong class="platform-points-award">
              {points.awarded >= 0 ? "+" : ""}
              {points.awarded} points
            </strong>
          ) : null}
          {points.total !== undefined ? (
            <p>{points.total} total points</p>
          ) : null}
          {points.pointsToday !== undefined ? (
            <p>{points.pointsToday} points today</p>
          ) : null}
          {!isExpired && points.message ? (
            <p>{points.message}</p>
          ) : null}
        </div>
      )
    }
    case "timers":
      return (
        <TimersView
          data={data as ContractData["entities.v1"]}
          now={now}
          settings={panel.settings}
          isControlEnabled={isControlEnabled}
          onAction={onAction}
        />
      )
    case "entities":
    case "map":
    case "charts":
      return (
        <EntitiesView
          data={data as ContractData["entities.v1"]}
          mode={panel.specId}
          settings={panel.settings}
          now={now}
          isControlEnabled={isControlEnabled}
          onAction={onAction}
        />
      )
    default:
      return (
        <div class="platform-empty">
          <h2>View unavailable</h2>
          <p>
            Install the {panel.specId} view package to use
            this panel.
          </p>
        </div>
      )
  }
}
