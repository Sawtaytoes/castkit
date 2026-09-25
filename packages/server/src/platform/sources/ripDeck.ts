import type { ContractData } from "@castkit/sdk/contracts"
import type { SourceFactory } from "@castkit/sdk/plugin"
import {
  finiteNumber,
  pollingSource,
  record,
  sourceRequest,
  stringList,
  textValue,
} from "./http.ts"
import { createSourceMedia } from "./mediaAssets.ts"

const optionalText = (value: unknown) =>
  typeof value === "string" && value ? value : undefined
/** Normalize Rip Deck's shared API/MQTT tower payload without hiding idle loaded bays. */
export const normalizeRipDeck = (
  data: unknown,
): ContractData["rip-deck.v1"] => {
  const document = record(data)
  const tower = record(document.ripDeck)
  if (!Array.isArray(tower.bays)) {
    throw new Error("Rip Deck response has no bays.")
  }
  const rips = (
    Array.isArray(document.hosts) ? document.hosts : []
  )
    .flatMap((host) => {
      const entries = record(host).rips
      return Array.isArray(entries) ? entries : []
    })
    .map(record)
  const bays = tower.bays.map((rawBay) => {
    const bay = record(rawBay)
    const state = record(bay.state)
    const rip =
      rips.find(
        (entry) =>
          entry.drive_id === bay.drive_id &&
          (!optionalText(state.job_id) ||
            entry.job_uuid === state.job_id),
      ) ?? {}
    const isPresent = bay.is_present === true
    const actions = stringList(bay.actions)
    const isActive = [
      "starting",
      "settling",
      "queued",
      "ripping",
      "identifying",
      "verifying",
      "throttled",
      "stalled",
      "finalising",
    ].includes(textValue(state.state))
    const isReadOnly =
      tower.is_fake === true || Boolean(tower.error)
    const trayActions =
      !isPresent ||
      isActive ||
      actions.some((action) =>
        ["open_bay", "close_bay"].includes(action),
      )
        ? []
        : bay.is_quarantined === true
          ? ["open_bay", "close_bay"]
          : [
                "completed",
                "failed",
                "cancelled",
                "needs_attention",
              ].includes(textValue(state.state))
            ? ["open_bay"]
            : ["close_bay"]
    const removedActions =
      !isActive &&
      (state.state !== "idle" ||
        bay.is_quarantined === true)
        ? ["clear_loaded"]
        : []
    const posterUrl = optionalText(rip.poster)
    const problemText =
      optionalText(record(bay.alert).message) ??
      optionalText(bay.quarantine_reason)
    return {
      id: textValue(bay.drive_id),
      name: textValue(bay.label),
      state: textValue(state.state) || "idle",
      ...(optionalText(state.job_id)
        ? { jobId: textValue(state.job_id) }
        : {}),
      ...(optionalText(rip.stage)
        ? { phase: textValue(rip.stage) }
        : {}),
      ...(optionalText(rip.status) && rip.active === false
        ? { outcome: textValue(rip.status) }
        : {}),
      title:
        textValue(state.title) ||
        textValue(state.disc_name) ||
        textValue(rip.label),
      percent: Math.min(
        100,
        Math.max(
          0,
          finiteNumber(state.progress_percent) ??
            finiteNumber(rip.percent) ??
            0,
        ),
      ),
      ...(finiteNumber(state.eta_seconds) !== undefined
        ? {
            remainingSeconds: finiteNumber(
              state.eta_seconds,
            ),
          }
        : {}),
      ...(posterUrl ? { posterUrl } : {}),
      ...(problemText ? { problemText } : {}),
      actions: isReadOnly
        ? []
        : [
            ...new Set([
              ...actions,
              ...trayActions,
              ...removedActions,
            ]),
          ],
      hasDisc:
        state.has_disc === true ||
        typeof bay.disc_size_sectors === "number",
      isPresent,
      isQuarantined: bay.is_quarantined === true,
      ...(optionalText(bay.last_tray_command)
        ? {
            lastTrayCommand: textValue(
              bay.last_tray_command,
            ),
          }
        : {}),
      ...(optionalText(rip.start)
        ? { startedAt: textValue(rip.start) }
        : {}),
      ...(optionalText(rip.stop)
        ? { finishedAt: textValue(rip.stop) }
        : {}),
    }
  })
  const alerts = (
    Array.isArray(tower.alerts) ? tower.alerts : []
  )
    .concat(tower.usb_alert ? [tower.usb_alert] : [])
    .map((raw) => {
      const alert = record(raw)
      return {
        message: textValue(alert.message),
        ...(optionalText(alert.confidence)
          ? { confidence: textValue(alert.confidence) }
          : {}),
        driveIds: stringList(alert.drive_ids),
      }
    })
  return {
    bays,
    alerts,
    isPresent: tower.is_tower_present === true,
    activeCount: finiteNumber(tower.active_count) ?? 0,
    loadedDiscCount:
      finiteNumber(record(tower.loaded_discs).count) ??
      bays.filter((bay) => bay.hasDisc).length,
  }
}
/** Rip Deck remains responsible for all drive safety and job decisions. */
export const createRipDeckSource: SourceFactory = (
  context,
) => {
  const media = createSourceMedia(context)
  const state: {
    snapshot: ContractData["rip-deck.v1"] | undefined
    isReadOnly: boolean
  } = { snapshot: undefined, isReadOnly: true }
  const poll = async () => {
    const response = await sourceRequest({
      context,
      path: "/json",
    })
    const document = await response.json()
    const tower = record(record(document).ripDeck)
    const snapshot = normalizeRipDeck(document)
    state.isReadOnly =
      tower.is_fake === true || Boolean(tower.error)
    state.snapshot = snapshot
    context.channels.forEach((channel) => {
      context.publish({
        channelId: channel.id,
        data: media.rewrite({
          channelId: channel.id,
          data: snapshot,
        }),
      })
    })
  }
  const polling = pollingSource({
    context,
    poll,
    intervalSeconds:
      finiteNumber(context.source.settings.pollSeconds) ??
      5,
  })
  return {
    ...polling,
    getMedia: media.getMedia,
    executeAction: async ({
      channelId,
      action,
      payload,
    }) => {
      if (
        !context.channels.some(
          (channel) => channel.id === channelId,
        )
      ) {
        throw new Error("Unknown channel.")
      }
      if (state.isReadOnly)
        throw new Error(
          "Rip Deck controls are unavailable.",
        )
      const driveId = textValue(payload.driveId)
      const isBulk = ["open_trays", "close_trays"].includes(
        action,
      )
      const bay = state.snapshot?.bays.find(
        (entry) => entry.id === driveId,
      )
      if (!isBulk && !bay?.actions.includes(action)) {
        throw new Error(
          "This bay does not offer that action.",
        )
      }
      const isTray =
        isBulk ||
        ["open_bay", "close_bay", "clear_loaded"].includes(
          action,
        )
      const response = await sourceRequest({
        context,
        path: isTray ? "/api/tray" : "/api/bay-action",
        method: "POST",
        body: isTray
          ? {
              command: action,
              ...(isBulk ? {} : { drive_id: driveId }),
            }
          : { action, drive_id: driveId },
      })
      const result = await response.json()
      const report = record(result)
      const bayReport = (
        Array.isArray(report.bays) ? report.bays : []
      )
        .map(record)
        .find((entry) => entry.drive_id === driveId)
      if (
        report.ok === false ||
        report.is_accepted === false ||
        (bayReport &&
          /^(refused|failed)/.test(
            textValue(bayReport.result),
          ))
      ) {
        throw new Error(
          textValue(bayReport?.detail) ||
            textValue(report.msg) ||
            textValue(report.message) ||
            "Rip Deck refused the action.",
        )
      }
      await poll().catch(() =>
        context.reportError({
          channelId,
          error:
            "The action succeeded, but the latest source state could not be refreshed.",
        }),
      )
      return result
    },
  }
}
