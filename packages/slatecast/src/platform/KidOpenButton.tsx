import type { ContractData } from "@castkit/sdk/contracts"
import { useRef } from "preact/hooks"

type KidEntry =
  ContractData["kids-points.v1"]["kids"][number]

/** Open a child locally, while a drag stays a scroll or navigation gesture. */
export const KidOpenButton = ({
  kid,
  onSelect,
}: {
  kid: KidEntry
  onSelect?: (id: string) => void
}) => {
  const contact = useRef({ x: 0, y: 0, hasMoved: false })
  if (!onSelect) return null
  return (
    <button
      type="button"
      class="kids-points-open"
      aria-label={`View ${kid.name}'s tasks today`}
      data-castkit-target={`kids-points-open:${kid.id}`}
      onPointerDown={(event) => {
        contact.current = {
          x: event.clientX,
          y: event.clientY,
          hasMoved: false,
        }
      }}
      onPointerMove={(event) => {
        if (
          Math.max(
            Math.abs(event.clientX - contact.current.x),
            Math.abs(event.clientY - contact.current.y),
          ) > 8
        )
          contact.current.hasMoved = true
      }}
      onPointerCancel={() => {
        contact.current.hasMoved = true
      }}
      onKeyDown={() => {
        contact.current.hasMoved = false
      }}
      onClick={() => {
        if (!contact.current.hasMoved) onSelect(kid.id)
      }}
    />
  )
}
