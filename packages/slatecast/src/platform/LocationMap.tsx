import type { ContractData } from "@castkit/sdk/contracts"
import { useContext, useState } from "preact/hooks"
import { DisplayContext } from "./DisplayContext.ts"

const WIDTH = 768
const HEIGHT = 432
const projectLatitude = (latitude: number) => {
  const radians =
    (Math.max(-85.0511, Math.min(85.0511, latitude)) *
      Math.PI) /
    180
  return (
    (1 -
      Math.log(Math.tan(radians) + 1 / Math.cos(radians)) /
        Math.PI) /
    2
  )
}

/** Fit location markers to the current viewport; tiles remain a separate authorized request. */
export const buildMapViewport = ({
  entities,
  zoomOffset = 0,
}: {
  entities: ContractData["entities.v1"]["entities"]
  zoomOffset?: number
}) => {
  const rawLocations = entities.flatMap((entity) =>
    typeof entity.attributes.latitude === "number" &&
    typeof entity.attributes.longitude === "number" &&
    Number.isFinite(entity.attributes.latitude) &&
    Number.isFinite(entity.attributes.longitude)
      ? [
          {
            id: entity.id,
            name: entity.name,
            latitude: entity.attributes.latitude,
            longitude: entity.attributes.longitude,
            horizontal:
              (entity.attributes.longitude + 180) / 360,
            vertical: projectLatitude(
              entity.attributes.latitude,
            ),
          },
        ]
      : [],
  )
  if (rawLocations.length === 0) {
    return { zoom: 0, tiles: [], locations: [] }
  }
  const isCrossingDateLine =
    rawLocations.length > 1 &&
    Math.max(
      ...rawLocations.map(
        (location) => location.horizontal,
      ),
    ) -
      Math.min(
        ...rawLocations.map(
          (location) => location.horizontal,
        ),
      ) >
      0.5
  const locations = rawLocations.map((location) => ({
    ...location,
    horizontal:
      isCrossingDateLine && location.horizontal < 0.5
        ? location.horizontal + 1
        : location.horizontal,
  }))
  const bounds = {
    left: Math.min(
      ...locations.map((location) => location.horizontal),
    ),
    right: Math.max(
      ...locations.map((location) => location.horizontal),
    ),
    top: Math.min(
      ...locations.map((location) => location.vertical),
    ),
    bottom: Math.max(
      ...locations.map((location) => location.vertical),
    ),
  }
  const zoom = Math.max(
    0,
    Math.min(
      17,
      Math.floor(
        Math.log2(
          Math.min(
            (WIDTH - 160) /
              256 /
              Math.max(0.00005, bounds.right - bounds.left),
            (HEIGHT - 120) /
              256 /
              Math.max(0.00005, bounds.bottom - bounds.top),
          ),
        ),
      ) + zoomOffset,
    ),
  )
  const worldSize = 256 * 2 ** zoom
  const origin = {
    horizontal:
      ((bounds.left + bounds.right) / 2) * worldSize -
      WIDTH / 2,
    vertical:
      ((bounds.top + bounds.bottom) / 2) * worldSize -
      HEIGHT / 2,
  }
  const firstColumn = Math.floor(origin.horizontal / 256)
  const firstRow = Math.floor(origin.vertical / 256)
  const columns =
    Math.ceil((origin.horizontal + WIDTH) / 256) -
    firstColumn
  const rows =
    Math.ceil((origin.vertical + HEIGHT) / 256) - firstRow
  const tiles = locations.length
    ? Array.from(
        { length: Math.min(20, columns * rows) },
        (_, index) => {
          const column = firstColumn + (index % columns)
          const row = firstRow + Math.floor(index / columns)
          return {
            column:
              ((column % 2 ** zoom) + 2 ** zoom) %
              2 ** zoom,
            row,
            horizontal: column * 256 - origin.horizontal,
            vertical: row * 256 - origin.vertical,
          }
        },
      ).filter(
        (tile) => tile.row >= 0 && tile.row < 2 ** zoom,
      )
    : []
  return {
    zoom,
    tiles,
    locations: locations.map((location) => ({
      ...location,
      horizontal:
        location.horizontal * worldSize - origin.horizontal,
      vertical:
        location.vertical * worldSize - origin.vertical,
    })),
  }
}

/** A bounded map with visible attribution, no prefetch, and coordinates when tiles are offline. */
export const LocationMap = ({
  entities,
}: {
  entities: ContractData["entities.v1"]["entities"]
}) => {
  const target = useContext(DisplayContext)
  const [zoomOffset, setZoomOffset] = useState(0)
  const [hasTileError, setHasTileError] = useState(false)
  const viewport = buildMapViewport({
    entities,
    zoomOffset,
  })
  if (viewport.locations.length === 0) {
    return <p>No locations available</p>
  }
  const tileBase = target
    ? `/api/display/${target.kind}/${encodeURIComponent(target.id)}/tiles`
    : null
  return (
    <figure class="platform-location-map">
      <div class="platform-map-controls">
        <button
          type="button"
          aria-label="Zoom in"
          disabled={viewport.zoom >= 17}
          onClick={() => {
            setZoomOffset((current) => current + 1)
            setHasTileError(false)
          }}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          disabled={viewport.zoom <= 0}
          onClick={() => {
            setZoomOffset((current) => current - 1)
            setHasTileError(false)
          }}
        >
          −
        </button>
        <button
          type="button"
          onClick={() => setZoomOffset(0)}
        >
          Fit locations
        </button>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Location map"
      >
        <rect
          width={WIDTH}
          height={HEIGHT}
          fill="var(--bg)"
        />
        {[1, 2, 3, 4, 5, 6].map((line) => (
          <g key={line} stroke="var(--color-border-subtle)">
            <path
              d={`M${line * 128} 0V${HEIGHT}M0 ${line * 72}H${WIDTH}`}
            />
          </g>
        ))}
        {tileBase
          ? viewport.tiles.map((tile) => (
              <image
                key={`${viewport.zoom}/${tile.column}/${tile.row}`}
                href={`${tileBase}/${viewport.zoom}/${tile.column}/${tile.row}.png`}
                x={tile.horizontal}
                y={tile.vertical}
                width={256}
                height={256}
                onError={() => setHasTileError(true)}
              />
            ))
          : null}
        {viewport.locations.map((location) => (
          <g key={location.id}>
            <circle
              cx={location.horizontal}
              cy={location.vertical}
              r={9}
              fill="var(--accent)"
              stroke="white"
              stroke-width={3}
            />
            <text
              x={location.horizontal}
              y={location.vertical - 18}
              text-anchor="middle"
              fill="var(--fg)"
              stroke="var(--bg)"
              stroke-width={4}
              paint-order="stroke"
              font-size={18}
            >
              {location.name}
            </text>
            <title>
              {location.name}: {location.latitude},{" "}
              {location.longitude}
            </title>
          </g>
        ))}
      </svg>
      <figcaption>
        {tileBase ? (
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            © OpenStreetMap contributors
          </a>
        ) : (
          "Coordinate map"
        )}
        {hasTileError ? (
          <span role="status">
            {" "}
            · Map tiles unavailable. Location markers remain
            current.
          </span>
        ) : null}
      </figcaption>
    </figure>
  )
}
