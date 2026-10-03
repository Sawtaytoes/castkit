import type { ContractData } from "@castkit/sdk/contracts"
import {
  useLayoutEffect,
  useRef,
  useState,
} from "preact/hooks"
import { CameraImage } from "./CameraImage.tsx"
import { structuredSetting } from "./viewSettings.ts"

type Camera = ContractData["cameras.v1"]["cameras"][number]

const CameraCard = ({
  camera,
  name,
}: {
  camera: Camera
  name: string
}) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const container = useRef<HTMLElement>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const closer = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => {
    if (!isExpanded) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    closer.current?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsExpanded(false)
      if (event.key !== "Tab") return
      const controls = Array.from(
        container.current?.querySelectorAll<HTMLElement>(
          "button:not([hidden]), video[controls], [tabindex='0']:not([hidden])",
        ) ?? [],
      )
      const first = controls[0]
      const last = controls.at(-1)
      if (
        event.shiftKey &&
        document.activeElement === first
      ) {
        event.preventDefault()
        last?.focus()
      } else if (
        !event.shiftKey &&
        document.activeElement === last
      ) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener("keydown", handleKey)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", handleKey)
      opener.current?.focus()
    }
  }, [isExpanded])
  return (
    <section
      ref={container}
      class="home-camera-card"
      data-expanded={String(isExpanded)}
      role={isExpanded ? "dialog" : undefined}
      {...(isExpanded
        ? { "aria-modal": "true" as const }
        : {})}
      aria-label={name}
    >
      <header>
        <strong>{name}</strong>
        <span>
          {camera.isLive
            ? "Live stream"
            : "Snapshot · refreshes every 10s"}
        </span>
        {isExpanded ? (
          <button
            ref={closer}
            type="button"
            onClick={() => setIsExpanded(false)}
          >
            Close {name}
          </button>
        ) : null}
      </header>
      <div class="home-camera-frame">
        <CameraImage
          url={camera.url}
          name={name}
          isLive={camera.isLive}
          format={camera.format}
        />
        <button
          ref={opener}
          class="home-camera-expand"
          type="button"
          hidden={isExpanded}
          onClick={() => setIsExpanded(true)}
          aria-label={`Expand ${name}`}
        >
          <span>Expand ↗</span>
        </button>
      </div>
    </section>
  )
}

/** Stable camera cards expand in place, preserving the authenticated media player. */
export const CamerasView = ({
  data,
  settings,
}: {
  data: ContractData["cameras.v1"]
  settings: Record<string, unknown>
}) => {
  const aliases = structuredSetting({
    settings,
    key: "aliases",
  }) as Record<string, unknown> | undefined
  return (
    <div class="home-camera-grid">
      {data.cameras.length ? (
        data.cameras.map((camera) => (
          <CameraCard
            key={camera.id}
            camera={camera}
            name={
              typeof aliases?.[camera.id] === "string"
                ? String(aliases[camera.id])
                : camera.name
            }
          />
        ))
      ) : (
        <p role="status">No cameras available</p>
      )}
    </div>
  )
}
