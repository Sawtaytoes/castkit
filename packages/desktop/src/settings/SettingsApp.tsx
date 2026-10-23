import { Button, Checkbox, Spinner } from "@charcuterie/ui"
import { useCallback, useEffect, useState } from "react"
import { DisplayPicker } from "./DisplayPicker.tsx"
import { readDesktopBridge } from "./desktopBridge.ts"
import { PageList } from "./PageList.tsx"
import { PcAudioPanel } from "./PcAudioPanel.tsx"
import { ServerPanel } from "./ServerPanel.tsx"
import type {
  PagesResult,
  SettingsSnapshot,
} from "./settingsApi.ts"
import { WindowList } from "./WindowList.tsx"

type Status = {
  tone: "success" | "error"
  text: string
}

/**
 * The settings window: which server, then the server's pages beside where a
 * new window opens and every window the app keeps. It fills the window and
 * scrolls only its two lists; a small window stacks and scrolls as a whole.
 */
export const SettingsApp = () => {
  const bridge = readDesktopBridge()
  const [snapshot, setSnapshot] =
    useState<SettingsSnapshot | null>(null)
  const [pagesResult, setPagesResult] =
    useState<PagesResult | null>(null)
  const [isChangingServer, setIsChangingServer] =
    useState(false)
  const [selectedDisplayId, setSelectedDisplayId] =
    useState<number | null>(null)
  const [isFullScreen, setIsFullScreen] = useState(true)
  const [status, setStatus] = useState<Status | null>(null)

  const refresh = useCallback(async () => {
    setSnapshot(await bridge.readSettings())
  }, [bridge])

  useEffect(() => {
    void refresh()
    return bridge.watchSettings(() => {
      void refresh()
    })
  }, [bridge, refresh])

  const serverOrigin = snapshot?.serverOrigin ?? null

  useEffect(() => {
    setPagesResult(null)
    if (serverOrigin) {
      void bridge.readPages().then(setPagesResult)
    }
  }, [bridge, serverOrigin])

  if (!snapshot) {
    return (
      <div className="settings-app">
        <Spinner
          label="Opening the settings…"
          isLabelVisible
        />
      </div>
    )
  }

  const displays = snapshot.displays
  const chosenDisplay =
    displays.find(
      (display) => display.id === selectedDisplayId,
    ) ??
    displays.find((display) => display.isPrimary) ??
    displays[0]

  const openPage = async ({
    page,
    name,
  }: {
    page: string
    name: string
  }) => {
    if (!chosenDisplay) {
      return
    }
    const result = await bridge.addWindow({
      page,
      displayId: chosenDisplay.id,
      isFullScreen,
    })
    setStatus(
      result.isDone
        ? {
            tone: "success",
            text: `Opened ${name} on display ${chosenDisplay.number}.`,
          }
        : { tone: "error", text: result.error },
    )
  }

  if (serverOrigin === null || isChangingServer) {
    return (
      <div className="settings-app">
        <ServerPanel
          serverOrigin={serverOrigin}
          onSaved={() => {
            setIsChangingServer(false)
            void refresh()
          }}
          onCancel={
            serverOrigin === null
              ? null
              : () => setIsChangingServer(false)
          }
        />
      </div>
    )
  }

  return (
    <div className="settings-app">
      <header className="settings-server">
        <div className="settings-server-name">
          <span className="settings-muted">
            CastKit server
          </span>
          <strong>{serverOrigin}</strong>
        </div>
        <Button
          appearance="outline"
          onClick={() => setIsChangingServer(true)}
        >
          Change server
        </Button>
      </header>
      <div className="settings-columns">
        <section
          className="settings-panel settings-options"
          aria-labelledby="options-heading"
        >
          <h2 id="options-heading">Open new windows on</h2>
          <DisplayPicker
            displays={displays}
            selectedDisplayId={chosenDisplay?.id ?? null}
            onChange={setSelectedDisplayId}
          />
          <Checkbox
            label="Fullscreen"
            description="F11 or Alt in a window changes this later."
            isChecked={isFullScreen}
            onChange={setIsFullScreen}
          />
        </section>
        <section
          className="settings-panel settings-pages"
          aria-labelledby="pages-heading"
        >
          <h2 id="pages-heading">Pages on this server</h2>
          {status ? (
            <p
              role="status"
              className={
                status.tone === "error"
                  ? "settings-error"
                  : "settings-muted"
              }
            >
              {status.text}
            </p>
          ) : null}
          <PageList
            pagesResult={pagesResult}
            onOpen={(request) => void openPage(request)}
          />
        </section>
        <section
          className="settings-panel settings-windows"
          aria-labelledby="windows-heading"
        >
          <h2 id="windows-heading">Your windows</h2>
          <div className="settings-scroll">
            <WindowList
              windows={snapshot.windows}
              onResult={(error) =>
                setStatus(
                  error
                    ? { tone: "error", text: error }
                    : null,
                )
              }
            />
          </div>
        </section>
        <section
          className="settings-panel settings-audio"
          aria-labelledby="audio-heading"
        >
          <h2 id="audio-heading">
            Send this computer's audio
          </h2>
          <PcAudioPanel pcAudio={snapshot.pcAudio} />
        </section>
      </div>
    </div>
  )
}
