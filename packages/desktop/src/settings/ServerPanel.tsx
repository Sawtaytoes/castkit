import {
  Accordion,
  Button,
  Card,
  Field,
  Spinner,
} from "@charcuterie/ui"
import { RefreshCw } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { readDesktopBridge } from "./desktopBridge.ts"
import type { ScanResult } from "./settingsApi.ts"

type ScanState =
  | { status: "scanning" }
  | { status: "done"; result: ScanResult }

const describeOrigin = (origin: string) => {
  try {
    const url = new URL(origin)
    return url.protocol === "https:" && url.port === ""
      ? url.host
      : origin
  } catch {
    return origin
  }
}

/**
 * Choosing the server: the CastKit servers a scan of this network finds,
 * each one a button, and typing an address as the last resort. It scans by
 * itself when it opens.
 */
export const ServerPanel = ({
  serverOrigin,
  onSaved,
  onCancel,
}: {
  serverOrigin: string | null
  onSaved: () => void
  onCancel: (() => void) | null
}) => {
  const [scan, setScan] = useState<ScanState>({
    status: "scanning",
  })
  const [address, setAddress] = useState(serverOrigin ?? "")
  const [error, setError] = useState<string | null>(null)

  const runScan = useCallback(async () => {
    setScan({ status: "scanning" })
    setScan({
      status: "done",
      result: await readDesktopBridge().scanForServers(),
    })
  }, [])

  useEffect(() => {
    void runScan()
  }, [runScan])

  const save = async (origin: string) => {
    const result =
      await readDesktopBridge().saveServerOrigin(origin)
    if (result.isDone) {
      setError(null)
      onSaved()
    } else {
      setError(result.error)
    }
  }

  return (
    <Card
      heading="Choose your CastKit server"
      headingLevel={2}
      surface="raised"
      actions={
        onCancel ? (
          <Button appearance="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : undefined
      }
    >
      <div className="settings-stack">
        {scan.status === "scanning" ? (
          <Spinner
            label="Looking for CastKit servers on this network…"
            isLabelVisible
          />
        ) : scan.result.servers.length === 0 ? (
          <p className="settings-muted">
            No CastKit server answered on{" "}
            {scan.result.networks.join(", ") ||
              "this computer's networks"}
            . Scan again, or enter the server's address
            below.
          </p>
        ) : (
          <ul
            className="settings-rows"
            aria-label="CastKit servers on this network"
          >
            {scan.result.servers.map((server) => (
              <li
                key={server.origin}
                className="settings-row"
              >
                <div className="settings-row-text">
                  <span className="settings-row-name">
                    {describeOrigin(server.origin)}
                  </span>
                  {server.origin ===
                  server.networkOrigin ? null : (
                    <span className="settings-row-detail">
                      {`Found at ${server.networkOrigin}`}
                    </span>
                  )}
                </div>
                <div className="settings-row-actions">
                  <Button
                    intent="accent"
                    appearance={
                      server.origin === serverOrigin
                        ? "outline"
                        : "solid"
                    }
                    onClick={() => void save(server.origin)}
                  >
                    {server.origin === serverOrigin
                      ? "In use"
                      : "Use this server"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div>
          <Button
            appearance="outline"
            iconStart={<RefreshCw size={16} aria-hidden />}
            isDisabled={scan.status === "scanning"}
            onClick={() => void runScan()}
          >
            Scan again
          </Button>
        </div>
        <Accordion
          headingLevel={3}
          items={[
            {
              key: "address",
              label: "Enter an address",
              content: (
                <form
                  className="settings-stack"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void save(address)
                  }}
                >
                  <Field
                    label="Server address"
                    description="For example http://castkit.local:8788 or https://castkit.example.com."
                  >
                    <input
                      className="settings-input"
                      value={address}
                      autoComplete="off"
                      onChange={(event) =>
                        setAddress(event.target.value)
                      }
                    />
                  </Field>
                  <div>
                    <Button type="submit" intent="accent">
                      Use this address
                    </Button>
                  </div>
                </form>
              ),
            },
          ]}
        />
        {error ? (
          <p className="settings-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Card>
  )
}
