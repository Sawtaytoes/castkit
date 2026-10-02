import type { ContractData } from "@castkit/sdk/contracts"
import { useEffect, useState } from "preact/hooks"
import { ICON_PATHS, Icon } from "../Icon.tsx"
import { ExpandableMedia } from "../views/ExpandableMedia.tsx"
import {
  FilamentControl,
  FilamentDetailsDialog,
} from "../views/FilamentDetails.tsx"
import {
  formatFinishTime,
  formatRemaining,
  getPrinterJobTitle,
  isSettledPrinterJob,
} from "../views/printerJob.ts"
import { CameraImage } from "./CameraImage.tsx"
import { useDisplayProperties } from "./displayProperties.ts"
import { safeMediaUrl } from "./protocol.ts"
import { usePrinterLayout } from "./usePrinterLayout.ts"

type PrinterData = ContractData["printers.v1"]

type PrinterCardProps = {
  printer: PrinterData["printers"][number]
  index: number
  cameras?: ContractData["cameras.v1"]
  settings: Record<string, unknown>
  isControlEnabled: boolean
  controlDisabledReason?: string
  expandedId: string
  setExpandedId: (id: string) => void
  filamentDetailsId: string
  setFilamentDetailsId: (id: string) => void
  onClear: () => void
  isClearing: boolean
  clearError?: string
  setConfirmation: (value: {
    id: string
    state: string
    jobName: string
    action: string
  }) => void
}

const PrinterCard = ({
  printer,
  index,
  cameras,
  settings,
  isControlEnabled,
  controlDisabledReason,
  expandedId,
  setExpandedId,
  filamentDetailsId,
  setFilamentDetailsId,
  setConfirmation,
  onClear,
  isClearing,
  clearError,
}: PrinterCardProps) => {
  const isSettled = isSettledPrinterJob(printer)
  const properties = useDisplayProperties()
  const camera = cameras?.cameras.find(
    (candidate) => candidate.id === printer.id,
  )
  const cameraUrl =
    settings.isCameraVisible !== false &&
    properties.hasLiveCamera
      ? safeMediaUrl(camera?.url ?? printer.cameraPath)
      : null
  const imageUrl =
    cameraUrl ?? safeMediaUrl(printer.thumbnailPath)
  const isCamera = Boolean(cameraUrl)
  const cardRef = usePrinterLayout({
    isCamera,
    hasImage: Boolean(imageUrl),
    contentKey: JSON.stringify([
      printer,
      isControlEnabled,
      controlDisabledReason,
      expandedId,
    ]),
  })
  return (
    <article
      ref={cardRef}
      class="printer-card"
      data-state={printer.state}
      data-compact-facts={String(
        settings.isCompactFacts === true,
      )}
      data-intent={
        printer.state === "finished"
          ? "success"
          : printer.state === "failed" ||
              printer.problemText
            ? "danger"
            : printer.state === "paused"
              ? "warning"
              : "neutral"
      }
      data-expanded={String(expandedId === printer.id)}
    >
      {imageUrl ? (
        <ExpandableMedia
          className="platform-printer-media"
          name={`${printer.name} ${isCamera ? "camera" : "print image"}`}
        >
          {isCamera ? (
            <CameraImage
              url={imageUrl}
              name={printer.name}
              isLive={
                camera?.isLive ?? printer.cameraIsLive
              }
              format={
                camera?.format ?? printer.cameraFormat
              }
              className="platform-printer-image"
            />
          ) : (
            <img
              class="platform-printer-image"
              src={imageUrl}
              alt=""
            />
          )}
        </ExpandableMedia>
      ) : null}
      <div class="printer-body">
        <div class="printer-head">
          {/* The same badge and name block as the device view: the
                    badge counts the columns, and the name is the printer's
                    own (the Bambuddy source strips its "1 - " ordering
                    prefix). */}
          <div class="printer-index" aria-hidden="true">
            {index + 1}
          </div>
          <div class="printer-names">
            <h2 class="printer-name">{printer.name}</h2>
            {printer.nozzleText ? (
              <div class="printer-meta">
                {printer.nozzleText}
              </div>
            ) : null}
          </div>
          <span class="printer-state">{printer.state}</span>
        </div>
        <button
          class="printer-job"
          type="button"
          onClick={() =>
            setExpandedId(
              expandedId === printer.id ? "" : printer.id,
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
        <div
          class="printer-progress-row"
          data-icons={String(
            settings.isCompactControls !== false,
          )}
        >
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
              !isSettled &&
              printer.state !== "paused" &&
              printer.remainingMinutes !== undefined ? (
                <span class="printer-band-remaining">
                  {formatRemaining(
                    printer.remainingMinutes,
                  )}{" "}
                  left
                </span>
              ) : null}
              {isSettled ? (
                <strong>
                  {printer.state === "finished"
                    ? "Finished · Clear plate"
                    : "Failed · Clear plate"}
                </strong>
              ) : properties.hasProgress ? (
                <strong class="printer-percent">
                  {Math.round(printer.percent)}%
                </strong>
              ) : (
                <span>Print in progress</span>
              )}
            </div>
          </div>
          {!isSettled ? (
            <div
              class="platform-actions printer-actions"
              data-icons={String(
                settings.isCompactControls !== false,
              )}
            >
              {[
                printer.state === "paused"
                  ? "resume"
                  : "pause",
                "stop",
              ].map((action) => (
                <button
                  key={action}
                  class={`printer-action ${action === "stop" ? "is-stop" : "is-pause"}`}
                  data-castkit-target={`printer:${printer.id}:${printer.jobName}:${printer.state}:${action}`}
                  type="button"
                  aria-label={
                    action === "resume"
                      ? "Resume"
                      : action === "pause"
                        ? "Pause"
                        : "Stop"
                  }
                  disabled={!isControlEnabled}
                  title={
                    !isControlEnabled
                      ? (controlDisabledReason ??
                        "Controls disabled")
                      : action === "resume"
                        ? "Resume"
                        : action === "pause"
                          ? "Pause"
                          : "Stop"
                  }
                  onClick={() =>
                    setConfirmation({
                      id: printer.id,
                      state: printer.state,
                      jobName: printer.jobName,
                      action,
                    })
                  }
                >
                  {settings.isCompactControls !== false ? (
                    <Icon
                      path={
                        action === "resume"
                          ? ICON_PATHS.play
                          : action === "pause"
                            ? ICON_PATHS.pause
                            : ICON_PATHS.stop
                      }
                      size="24px"
                    />
                  ) : action === "resume" ? (
                    "Resume"
                  ) : action === "pause" ? (
                    "Pause"
                  ) : (
                    "Stop"
                  )}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {!isControlEnabled ? (
          <p class="printer-control-status" role="status">
            {controlDisabledReason ?? "Controls disabled"}
          </p>
        ) : null}
        {isSettled ? (
          <>
            {clearError ? (
              <p class="printer-problem" role="alert">
                {clearError}
              </p>
            ) : null}
            <button
              class="printer-clear"
              type="button"
              disabled={!isControlEnabled || isClearing}
              data-castkit-target={`printer-clear-plate:${printer.id}`}
              onClick={onClear}
            >
              {isClearing ? "Clearing…" : "Clear plate"}
            </button>
          </>
        ) : (
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
            {printer.filamentText ||
            printer.filaments?.length ? (
              <div class="printer-metric is-filament">
                <dt>Filament</dt>
                <dd>
                  <FilamentControl
                    color={printer.filamentColor}
                    isExpanded={
                      filamentDetailsId === printer.id
                    }
                    filaments={printer.filaments}
                    onClick={() =>
                      setFilamentDetailsId(printer.id)
                    }
                    text={printer.filamentText}
                  />
                </dd>
              </div>
            ) : null}
          </dl>
        )}
      </div>
    </article>
  )
}

/** Native printer cards reuse the existing progress-card tokens and add optional cameras. */
export const PrintersView = ({
  data,
  cameras,
  isControlEnabled,
  controlDisabledReason,
  onAction,
  settings,
}: {
  data: PrinterData
  cameras?: ContractData["cameras.v1"]
  isControlEnabled: boolean
  controlDisabledReason?: string
  onAction: (
    action: string,
    payload?: Record<string, unknown>,
  ) => Promise<void>
  settings: Record<string, unknown>
}) => {
  const [confirmation, setConfirmation] = useState<{
    id: string
    state: string
    jobName: string
    action: string
  } | null>(null)
  const [clearingIds, setClearingIds] = useState<string[]>(
    [],
  )
  const [clearErrors, setClearErrors] = useState<
    Record<string, string>
  >({})
  const clearPlate = async (id: string) => {
    setClearingIds((ids) => ids.concat(id))
    setClearErrors((errors) => ({ ...errors, [id]: "" }))
    try {
      await onAction("clear_plate", { printerId: id })
    } catch (error) {
      setClearErrors((errors) => ({
        ...errors,
        [id]:
          error instanceof Error
            ? error.message
            : "Could not clear plate",
      }))
    } finally {
      setClearingIds((ids) =>
        ids.filter((candidate) => candidate !== id),
      )
    }
  }
  const [expandedId, setExpandedId] = useState("")
  const [filamentDetailsId, setFilamentDetailsId] =
    useState("")
  useEffect(() => {
    const timer = setTimeout(
      () => setConfirmation(null),
      12_000,
    )
    return () => clearTimeout(timer)
  }, [confirmation])
  useEffect(() => {
    if (
      filamentDetailsId &&
      !data.printers.some(
        (printer) => printer.id === filamentDetailsId,
      )
    ) {
      setFilamentDetailsId("")
    }
  }, [data.printers, filamentDetailsId])
  const confirmedJob = confirmation
    ? data.printers.find(
        (printer) =>
          printer.id === confirmation.id &&
          printer.state === confirmation.state &&
          printer.jobName === confirmation.jobName,
      )
    : undefined
  const filamentDetailsPrinter = data.printers.find(
    (printer) => printer.id === filamentDetailsId,
  )
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
      {data.printers.map((printer, index) => (
        <PrinterCard
          key={printer.id}
          printer={printer}
          index={
            index +
            (typeof settings.printerIndex === "number"
              ? settings.printerIndex
              : 0)
          }
          cameras={cameras}
          settings={settings}
          isControlEnabled={isControlEnabled}
          controlDisabledReason={controlDisabledReason}
          expandedId={expandedId}
          setExpandedId={setExpandedId}
          filamentDetailsId={filamentDetailsId}
          setFilamentDetailsId={setFilamentDetailsId}
          setConfirmation={setConfirmation}
          onClear={() => {
            void clearPlate(printer.id)
          }}
          isClearing={clearingIds.includes(printer.id)}
          clearError={clearErrors[printer.id]}
        />
      ))}
      {filamentDetailsPrinter ? (
        <FilamentDetailsDialog
          filaments={filamentDetailsPrinter.filaments}
          jobName={filamentDetailsPrinter.jobName}
          onClose={() => setFilamentDetailsId("")}
          printerName={filamentDetailsPrinter.name}
        />
      ) : null}
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
