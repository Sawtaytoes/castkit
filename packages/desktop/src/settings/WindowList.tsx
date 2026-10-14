import { Badge, Button, EmptyState } from "@charcuterie/ui"
import { readDesktopBridge } from "./desktopBridge.ts"
import type { SettingsWindow } from "./settingsApi.ts"

/**
 * Every window the app keeps. A closed window keeps its page, monitor,
 * zoom, and sign-in, and Open brings it back; Remove forgets it for good.
 */
export const WindowList = ({
  windows,
  onResult,
}: {
  windows: SettingsWindow[]
  onResult: (message: string | null) => void
}) => {
  if (windows.length === 0) {
    return (
      <EmptyState
        heading="No windows yet"
        headingLevel={3}
        size="sm"
        description="Open a page to add its window here."
      />
    )
  }
  return (
    <ul className="settings-rows" aria-label="Your windows">
      {windows.map((savedWindow) => {
        const name = savedWindow.title || savedWindow.path
        return (
          <li key={savedWindow.id} className="settings-row">
            <div className="settings-row-text">
              <span className="settings-row-name">
                <span title={name}>{name}</span>
                <Badge
                  intent={
                    savedWindow.isOpen
                      ? "success"
                      : "neutral"
                  }
                >
                  {savedWindow.isOpen ? "Open" : "Closed"}
                </Badge>
              </span>
              <span className="settings-row-detail">
                {[
                  savedWindow.title
                    ? savedWindow.path
                    : null,
                  savedWindow.displayNumber === null
                    ? "Monitor not connected"
                    : `Display ${savedWindow.displayNumber}`,
                ]
                  .filter((part) => part !== null)
                  .join(" · ")}
              </span>
            </div>
            <div className="settings-row-actions">
              <Button
                size="sm"
                appearance={
                  savedWindow.isOpen ? "outline" : "solid"
                }
                intent={
                  savedWindow.isOpen ? "neutral" : "accent"
                }
                aria-label={`${savedWindow.isOpen ? "Show" : "Open"} ${name}`}
                onClick={async () => {
                  const result =
                    await readDesktopBridge().openWindow(
                      savedWindow.id,
                    )
                  onResult(
                    result.isDone ? null : result.error,
                  )
                }}
              >
                {savedWindow.isOpen ? "Show" : "Open"}
              </Button>
              <Button
                size="sm"
                appearance="ghost"
                intent="danger"
                aria-label={`Remove ${name}`}
                onClick={async () => {
                  const result =
                    await readDesktopBridge().removeWindow(
                      savedWindow.id,
                    )
                  onResult(
                    result.isDone ? null : result.error,
                  )
                }}
              >
                Remove
              </Button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
