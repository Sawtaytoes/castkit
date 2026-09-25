import type { ContractData } from "@castkit/sdk/contracts"
import { useEffect, useRef, useState } from "preact/hooks"
import { safeMediaUrl } from "./protocol.ts"

type RipData = ContractData["rip-deck.v1"]
type Bay = RipData["bays"][number]
const isActive = (bay: Bay) =>
  [
    "ripping",
    "starting",
    "settling",
    "queued",
    "identifying",
    "verifying",
    "throttled",
    "finalising",
    "stalled",
    "slow",
    "reading",
    "scanning",
  ].includes(bay.state) || bay.actions.includes("cancel")
const identity = (bay: Bay) =>
  `${bay.id}:${bay.jobId ?? ""}:${bay.title}:${bay.startedAt ?? ""}:${bay.state}:${bay.lastTrayCommand ?? ""}`
const labels: Record<string, string> = {
  open_bay: "Open",
  close_bay: "Close",
  clear_loaded: "Disc removed",
  cancel: "Cancel rip",
}

/** Active rows with twelve-second transition feedback and server-authorized physical controls. */
export const RipDeckView = ({
  data,
  isControlEnabled,
  onAction,
}: {
  data: RipData
  isControlEnabled: boolean
  onAction: (
    action: string,
    payload?: Record<string, unknown>,
  ) => Promise<void>
}) => {
  const [selectedId, setSelectedId] = useState("")
  const [cancelIdentity, setCancelIdentity] = useState<
    string | null
  >(null)
  const [visibleUntil, setVisibleUntil] = useState<
    Record<string, number>
  >({})
  const previous = useRef<Record<string, string> | null>(
    null,
  )
  useEffect(() => {
    const old = previous.current
    previous.current = Object.fromEntries(
      data.bays.map((bay) => [bay.id, identity(bay)]),
    )
    if (!old) {
      return
    }
    setVisibleUntil((current) =>
      Object.fromEntries(
        data.bays
          .filter((bay) => !isActive(bay))
          .map((bay) => [
            bay.id,
            old[bay.id] !== identity(bay)
              ? Date.now() + 12_000
              : (current[bay.id] ?? 0),
          ]),
      ),
    )
  }, [data.bays])
  useEffect(() => {
    const expirations = Object.values(visibleUntil).filter(
      (expiry) => expiry > Date.now(),
    )
    if (expirations.length === 0) {
      return
    }
    const timeout = setTimeout(
      () =>
        setVisibleUntil((current) =>
          Object.fromEntries(
            Object.entries(current).filter(
              ([, expiry]) => expiry > Date.now(),
            ),
          ),
        ),
      Math.max(0, Math.min(...expirations) - Date.now()) +
        1,
    )
    return () => clearTimeout(timeout)
  }, [visibleUntil])
  useEffect(() => {
    const timeout = setTimeout(
      () => setCancelIdentity(null),
      12_000,
    )
    return () => clearTimeout(timeout)
  }, [cancelIdentity])
  const selected = data.bays.find(
    (bay) => bay.id === selectedId,
  )
  const focused = data.bays.filter(
    (bay) =>
      isActive(bay) ||
      (visibleUntil[bay.id] ?? 0) > Date.now(),
  )
  const renderDetails = (bay: Bay) => (
    <div class="platform-rip-details">
      <h2>
        {bay.name} · {bay.title || "No disc"}
      </h2>
      <div class="platform-rip-disc">
        {safeMediaUrl(bay.posterUrl) ? (
          <img
            src={safeMediaUrl(bay.posterUrl)}
            alt={`Poster for ${bay.title}`}
          />
        ) : (
          <div class="platform-empty">No artwork</div>
        )}
        <div>
          <p>
            {bay.state} · {Math.round(bay.percent)}%
          </p>
          {bay.phase ? <p>{bay.phase}</p> : null}
          {bay.remainingSeconds !== undefined ? (
            <p>
              {Math.ceil(bay.remainingSeconds / 60)} minutes
              left
            </p>
          ) : null}
          {bay.outcome ? <p>{bay.outcome}</p> : null}
          {bay.problemText ? (
            <p role="status">{bay.problemText}</p>
          ) : null}
          <progress
            max={100}
            value={bay.percent}
            aria-label={`${bay.name} progress`}
          />
        </div>
      </div>
      <div class="platform-actions">
        {Object.entries(labels).map(([action, label]) => (
          <button
            type="button"
            key={action}
            disabled={
              !isControlEnabled ||
              !bay.actions.includes(action) ||
              (action !== "cancel" && isActive(bay))
            }
            data-castkit-target={`${action}:${identity(bay)}`}
            onClick={() =>
              action === "cancel"
                ? setCancelIdentity(identity(bay))
                : void onAction(action, { driveId: bay.id })
            }
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          data-castkit-target={`back:${identity(bay)}`}
          onClick={() => {
            setSelectedId("")
            setCancelIdentity(null)
          }}
        >
          Back
        </button>
      </div>
      {isActive(bay) ? (
        <p>
          Tray controls are unavailable while this bay rips.
        </p>
      ) : null}
      {cancelIdentity ? (
        <div
          class="platform-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-label="Cancel this rip?"
        >
          <div>
            <h2>Cancel this rip?</h2>
            <p>
              The partial output stays. The tray opens after
              the ripper exits.
            </p>
            <div class="platform-actions">
              <button
                type="button"
                data-castkit-target={`keep-ripping:${cancelIdentity}`}
                onClick={() => setCancelIdentity(null)}
              >
                Keep ripping
              </button>
              <button
                type="button"
                data-castkit-target={`confirm-cancel:${cancelIdentity}`}
                disabled={
                  !isControlEnabled ||
                  cancelIdentity !== identity(bay) ||
                  !bay.actions.includes("cancel")
                }
                onClick={() => {
                  void onAction("cancel", {
                    driveId: bay.id,
                  })
                  setCancelIdentity(null)
                }}
              >
                Cancel rip
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
  return (
    <div class="platform-rips">
      {data.alerts.map((alert, index) => (
        <p
          key={`${alert.message}:${index}`}
          class="platform-notice"
          role="status"
        >
          {alert.message}
        </p>
      ))}
      {selected ? (
        renderDetails(selected)
      ) : selectedId ? (
        <div class="platform-empty">
          <p>This bay is no longer available.</p>
          <button
            type="button"
            data-castkit-target={`missing-bay-back:${selectedId}`}
            onClick={() => setSelectedId("")}
          >
            Back
          </button>
        </div>
      ) : !data.isPresent ? (
        <div class="platform-empty">
          <h2>Tower is off</h2>
          <p>No drives answered.</p>
        </div>
      ) : focused.length === 0 ? (
        <div class="platform-empty">
          <h2>No rips running</h2>
          <p>Active bays will appear here.</p>
        </div>
      ) : (
        <div
          class="platform-rip-rows"
          data-density={
            focused.length <= 3
              ? "focus"
              : focused.length <= 6
                ? "roomy"
                : "compact"
          }
        >
          {focused.map((bay) => (
            <button
              type="button"
              class="platform-rip-row"
              data-castkit-target={`details:${identity(bay)}`}
              key={bay.id}
              data-warning={Boolean(
                bay.problemText || bay.state === "stalled",
              )}
              onClick={() => setSelectedId(bay.id)}
            >
              <span
                class="platform-rip-fill"
                style={{ width: `${bay.percent}%` }}
              />
              <span class="platform-rip-number">
                {bay.name}
              </span>
              <span class="platform-rip-title">
                <strong>{bay.title || "No disc"}</strong>
                <span>
                  {bay.problemText ??
                    bay.phase ??
                    bay.state}
                </span>
              </span>
              <strong>{Math.round(bay.percent)}%</strong>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
