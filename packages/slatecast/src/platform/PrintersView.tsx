import type { ContractData } from "@castkit/sdk/contracts"
import { useEffect, useState } from "preact/hooks"
import {
  formatFinishTime,
  formatRemaining,
  getPrinterJobTitle,
} from "../views/printerJob.ts"
import { CameraImage } from "./CameraImage.tsx"
import { useDisplayProperties } from "./displayProperties.ts"
import { safeMediaUrl } from "./protocol.ts"

type PrinterData = ContractData["printers.v1"]

/** Native printer cards reuse the existing progress-card tokens and add optional cameras. */
export const PrintersView = ({
  data,
  cameras,
  isControlEnabled,
  onAction,
  settings,
}: {
  data: PrinterData
  cameras?: ContractData["cameras.v1"]
  isControlEnabled: boolean
  onAction: (
    action: string,
    payload?: Record<string, unknown>,
  ) => Promise<void>
  settings: Record<string, unknown>
}) => {
  const properties = useDisplayProperties()
  const [confirmation, setConfirmation] = useState<{
    id: string
    state: string
    jobName: string
    action: string
  } | null>(null)
  const [expandedId, setExpandedId] = useState("")
  useEffect(() => {
    const timer = setTimeout(
      () => setConfirmation(null),
      12_000,
    )
    return () => clearTimeout(timer)
  }, [confirmation])
  const confirmedJob = confirmation
    ? data.printers.find(
        (printer) =>
          printer.id === confirmation.id &&
          printer.state === confirmation.state &&
          printer.jobName === confirmation.jobName,
      )
    : undefined
  if (data.printers.length === 0) {
    return (
      <div class="platform-empty">
        <h2>No active prints</h2>
        <p>Active printers will appear here.</p>
      </div>
    )
  }
  return (
    <div class="platform-printers">
      {data.printers.map((printer) => {
        const camera = cameras?.cameras.find(
          (candidate) => candidate.id === printer.id,
        )
        const imageUrl =
          settings.isCameraVisible === false ||
          !properties.hasLiveCamera
            ? safeMediaUrl(printer.thumbnailPath)
            : (safeMediaUrl(
                camera?.url ?? printer.cameraPath,
              ) ?? safeMediaUrl(printer.thumbnailPath))
        return (
          <article
            key={printer.id}
            class="printer-card"
            data-intent={
              printer.problemText
                ? "danger"
                : printer.state === "paused"
                  ? "warning"
                  : "neutral"
            }
            data-expanded={String(
              expandedId === printer.id,
            )}
          >
            {imageUrl &&
            settings.isCameraVisible !== false &&
            properties.hasLiveCamera &&
            (camera || printer.cameraPath) ? (
              <CameraImage
                url={imageUrl}
                name={printer.name}
                isLive={camera?.isLive}
                className="platform-printer-image"
              />
            ) : imageUrl ? (
              <img
                class="platform-printer-image"
                src={imageUrl}
                alt=""
              />
            ) : null}
            <div class="printer-body">
              <div class="printer-head">
                <h2 class="printer-name">{printer.name}</h2>
                <span class="printer-state">
                  {printer.state}
                </span>
              </div>
              <button
                class="printer-job"
                type="button"
                onClick={() =>
                  setExpandedId(
                    expandedId === printer.id
                      ? ""
                      : printer.id,
                  )
                }
              >
                {expandedId === printer.id
                  ? printer.jobName
                  : getPrinterJobTitle(printer) ||
                    printer.jobName}
              </button>
              {printer.problemText ? (
                <p class="printer-problem">
                  {printer.problemText}
                </p>
              ) : null}
              <div class="printer-band">
                <div
                  class="printer-band-fill"
                  style={{
                    width: properties.hasProgress
                      ? `${printer.percent}%`
                      : "0%",
                  }}
                />
                <div class="printer-band-text">
                  {properties.hasRelativeTimes &&
                  printer.state !== "paused" &&
                  printer.remainingMinutes !== undefined ? (
                    <span class="printer-band-remaining">
                      {formatRemaining(
                        printer.remainingMinutes,
                      )}{" "}
                      left
                    </span>
                  ) : null}
                  {properties.hasProgress ? (
                    <strong class="printer-percent">
                      {Math.round(printer.percent)}%
                    </strong>
                  ) : (
                    <span>Print in progress</span>
                  )}
                </div>
              </div>
              <dl class="printer-metrics">
                <div class="printer-metric">
                  <dt>Layer</dt>
                  <dd>
                    {printer.currentLayer ?? "—"}
                    {printer.totalLayers
                      ? ` / ${printer.totalLayers}`
                      : ""}
                  </dd>
                </div>
                <div class="printer-metric">
                  <dt>Finishes</dt>
                  <dd>
                    {printer.state !== "paused" &&
                    printer.finishAtMs
                      ? formatFinishTime({
                          finishAtMs: printer.finishAtMs,
                          nowMillis: Date.now(),
                        })
                      : "—"}
                  </dd>
                </div>
              </dl>
              {printer.filamentText ? (
                <p>{printer.filamentText}</p>
              ) : null}
              {isControlEnabled ? (
                <div class="platform-actions">
                  {[
                    printer.state === "paused"
                      ? "resume"
                      : "pause",
                    "stop",
                  ].map((action) => (
                    <button
                      key={action}
                      data-castkit-target={`printer:${printer.id}:${printer.jobName}:${printer.state}:${action}`}
                      type="button"
                      onClick={() =>
                        setConfirmation({
                          id: printer.id,
                          state: printer.state,
                          jobName: printer.jobName,
                          action,
                        })
                      }
                    >
                      {action === "resume"
                        ? "Resume"
                        : action === "pause"
                          ? "Pause"
                          : "Stop"}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </article>
        )
      })}
      {confirmation && confirmedJob ? (
        <div
          class="platform-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-label="Confirm printer action"
        >
          <div>
            <h2>
              {confirmation.action === "stop"
                ? "Stop this print?"
                : confirmation.action === "pause"
                  ? "Pause this print?"
                  : "Resume this print?"}
            </h2>
            <p>
              {confirmedJob.name} · {confirmedJob.jobName}
            </p>
            <div class="platform-actions">
              <button
                type="button"
                data-castkit-target={`printer-back:${confirmation.id}:${confirmation.action}`}
                onClick={() => setConfirmation(null)}
              >
                Go back
              </button>
              <button
                type="button"
                data-castkit-target={`printer-confirm:${confirmation.id}:${confirmation.jobName}:${confirmation.state}:${confirmation.action}`}
                disabled={!isControlEnabled}
                onClick={() => {
                  void onAction(confirmation.action, {
                    printerId: confirmation.id,
                  })
                  setConfirmation(null)
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
