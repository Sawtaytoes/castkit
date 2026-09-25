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

const mediaUrl = ({
  channelId,
  printerId,
  kind,
}: {
  channelId: string
  printerId: string
  kind: string
}) =>
  `/api/platform/channels/${encodeURIComponent(channelId)}/media/${encodeURIComponent(printerId)}?kind=${kind}`
/** Bambuddy's printer state becomes the same contract as an MQTT printer source. */
export const normalizeBambuddyPrinter = ({
  data,
  channelId,
}: {
  data: unknown
  channelId: string
}):
  | ContractData["printers.v1"]["printers"][number]
  | undefined => {
  const status = record(data)
  const state = textValue(status.state)
  if (
    !status.connected ||
    !["RUNNING", "PAUSE", "PREPARE"].includes(state)
  ) {
    return undefined
  }
  const id = String(status.id)
  const remainingMinutes = finiteNumber(
    status.remaining_time,
  )
  const problems = (
    Array.isArray(status.hms_errors)
      ? status.hms_errors
      : []
  )
    .map((error) => textValue(record(error).code))
    .filter(Boolean)
  return {
    id,
    name: textValue(status.name),
    jobName:
      textValue(status.subtask_name) ||
      textValue(status.current_print) ||
      textValue(status.gcode_file),
    percent: Math.min(
      100,
      Math.max(0, finiteNumber(status.progress) ?? 0),
    ),
    state:
      state === "PAUSE"
        ? "paused"
        : state === "PREPARE"
          ? "preparing"
          : "printing",
    ...(remainingMinutes !== undefined
      ? {
          remainingMinutes,
          finishAtMs: Date.now() + remainingMinutes * 60000,
        }
      : {}),
    ...(finiteNumber(status.layer_num) !== undefined
      ? { currentLayer: finiteNumber(status.layer_num) }
      : {}),
    ...(finiteNumber(status.total_layers) !== undefined
      ? { totalLayers: finiteNumber(status.total_layers) }
      : {}),
    ...(status.cover_url
      ? {
          thumbnailPath: mediaUrl({
            channelId,
            printerId: id,
            kind: "cover",
          }),
        }
      : {}),
    cameraPath: mediaUrl({
      channelId,
      printerId: id,
      kind: "camera",
    }),
    ...(problems.length
      ? {
          problemText: `Printer reports: ${problems.join(", ")}`,
        }
      : {}),
  }
}
/** Direct Bambuddy source with selected printers, camera snapshots and guarded controls. */
export const createBambuddySource: SourceFactory = (
  context,
) => {
  const headers = {
    "X-API-Key": context.secrets.apiKey ?? "",
  }
  const state = {
    printers: [] as Record<string, unknown>[],
  }
  const camera = {
    token: undefined as
      | { value: string; expiresAt: number }
      | undefined,
    pending: undefined as Promise<string> | undefined,
  }
  const getCameraToken = async () => {
    if (
      camera.token &&
      camera.token.expiresAt > Date.now()
    ) {
      return camera.token.value
    }
    if (camera.pending) {
      return camera.pending
    }
    camera.pending = (async () => {
      const response = await sourceRequest({
        context,
        headers,
        path: "/api/v1/printers/camera/stream-token",
        method: "POST",
      })
      const result = record(await response.json())
      if (
        typeof result.token !== "string" ||
        !result.token
      ) {
        throw new Error(
          "Bambuddy did not grant camera access.",
        )
      }
      camera.token = {
        value: result.token,
        expiresAt: Date.now() + 55 * 60000,
      }
      return result.token
    })()
    try {
      return await camera.pending
    } finally {
      camera.pending = undefined
    }
  }
  const selectedIds = (channelId: string) => {
    const channel = context.channels.find(
      (entry) => entry.id === channelId,
    )
    if (!channel) {
      return []
    }
    const configured = stringList(
      channel.settings.printerIds,
    )
    return state.printers
      .map((printer) => String(printer.id))
      .filter(
        (id) =>
          configured.length === 0 ||
          configured.includes(id),
      )
  }
  const listPrinters = async () => {
    const response = await sourceRequest({
      context,
      headers,
      path: "/api/v1/printers/",
    })
    const data = await response.json()
    if (!Array.isArray(data)) {
      throw new Error(
        "Bambuddy returned an invalid printer list.",
      )
    }
    state.printers = data.map(record)
    return state.printers
  }
  const poll = async () => {
    await listPrinters()
    const ids = Array.from(
      new Set(
        context.channels.flatMap((channel) =>
          selectedIds(channel.id),
        ),
      ),
    )
    const statuses = await Promise.all(
      ids.map(
        async (id) =>
          [
            id,
            await (
              await sourceRequest({
                context,
                headers,
                path: `/api/v1/printers/${encodeURIComponent(id)}/status`,
              })
            ).json(),
          ] as const,
      ),
    )
    const statusById = new Map(statuses)
    context.channels.forEach((channel) => {
      const selection = selectedIds(channel.id)
      if (channel.type === "cameras.v1") {
        context.publish({
          channelId: channel.id,
          data: {
            cameras: state.printers
              .filter((printer) =>
                selection.includes(String(printer.id)),
              )
              .map((printer) => ({
                id: String(printer.id),
                name: textValue(printer.name),
                url: mediaUrl({
                  channelId: channel.id,
                  printerId: String(printer.id),
                  kind: "camera",
                }),
                isLive: false,
              })),
          },
        })
      } else {
        const printers = selection.flatMap((id) => {
          const printer = normalizeBambuddyPrinter({
            data: statusById.get(id),
            channelId: channel.id,
          })
          return printer ? [printer] : []
        })
        context.publish({
          channelId: channel.id,
          data: { printers },
        })
      }
    })
  }
  return {
    ...pollingSource({
      context,
      poll,
      intervalSeconds:
        finiteNumber(context.source.settings.pollSeconds) ??
        5,
    }),
    discover: async () => ({
      printers: (await listPrinters()).map((printer) => ({
        id: String(printer.id),
        name: textValue(printer.name),
      })),
    }),
    executeAction: async ({
      channelId,
      action,
      payload,
    }) => {
      const printerId = textValue(payload.printerId)
      const command = action.replace(/^printer_/, "")
      if (
        !["pause", "resume", "stop"].includes(command) ||
        !selectedIds(channelId).includes(printerId)
      ) {
        throw new Error(
          "This channel does not allow that printer action.",
        )
      }
      const response = await sourceRequest({
        context,
        headers,
        path: `/api/v1/printers/${encodeURIComponent(printerId)}/print/${command}`,
        method: "POST",
      })
      const result = await response.json()
      if (record(result).success === false) {
        throw new Error(
          "Bambuddy refused the printer command.",
        )
      }
      return result
    },
    getMedia: async ({ channelId, assetId, kind }) => {
      if (
        !selectedIds(channelId).includes(assetId) ||
        !["camera", "cover"].includes(kind ?? "")
      ) {
        throw new Error(
          "This media is not part of the selected printers.",
        )
      }
      return sourceRequest({
        context,
        headers,
        path: `/api/v1/printers/${encodeURIComponent(assetId)}/${kind === "camera" ? `camera/snapshot?token=${encodeURIComponent(await getCameraToken())}` : "cover"}`,
        timeoutMilliseconds:
          kind === "camera" ? 20000 : 10000,
      })
    },
  }
}
