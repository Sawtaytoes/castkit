import type { ComponentChildren } from "preact"
import { useState } from "preact/hooks"

/** Mount a group's individual controls only when requested, keeping kiosk memory bounded. */
export const HomeLightMembers = ({
  count,
  render,
}: {
  count: number
  render: () => ComponentChildren
}) => {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <details
      class="home-light-members"
      onToggle={(event) =>
        setIsOpen(event.currentTarget.open)
      }
    >
      <summary>Individual lights · {count}</summary>
      {isOpen ? <div>{render()}</div> : null}
    </details>
  )
}
