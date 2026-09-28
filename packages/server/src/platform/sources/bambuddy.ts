import type { ContractData } from "@castkit/sdk/contracts"
import type { SourceFactory } from "@castkit/sdk/plugin"
import {
  type BambuddyAssignment,
  createBambuddyEventStream,
  INVENTORY_REFRESH_EVENTS,
  initialSpoolReaderState,
  normalizeBambuddyAssignments,
  normalizeBambuddySpool,
  normalizeBambuddySpoolsPrinter,
  reduceSpoolReaderEvent,
} from "./bambuddySpools.ts"
import {
  finiteNumber,
  pollingSource,
  record,
  sourceRequest,
  stringList,
  textValue,
} from "./http.ts"

/** The product half of a Bambuddy spool: what a copy onto a new tag carries. */
const SPOOL_PRODUCT_FIELDS = [
  "material",
  "subtype",
  "brand",
  "color_name",
  "rgba",
  "extra_colors",
  "effect_type",
  "label_weight",
  "core_weight",
] as const
const SPOOL_ACTIONS = [
  "save_weight",
  "assign_slot",
  "copy_to_tag",
  "link_tag",
] as const
/** Bambuddy keys every spool and printer by an integer id. */
const integerId = (value: unknown) => {
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : undefined
}

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
/**
 * The filament the printer is feeding right now, from Bambuddy's `tray_now`:
 * a global tray id (`ams_id * 4 + slot`), 254 for the external spool and 255
 * for none. The text matches what Home Assistant's own printers source
 * publishes ("PLA Matte · AMS 3 slot 3"), so the Printer Status card reads
 * the same whichever source feeds it.
 */
const activeFilament = (
  status: Record<string, unknown>,
):
  | { filamentText: string; filamentColor?: string }
  | undefined => {
  const trayNow = finiteNumber(status.tray_now)
  if (trayNow === undefined || trayNow === 255) {
    return undefined
  }
  const trays = (list: unknown) =>
    (Array.isArray(list) ? list : []).map(record)
  const isExternal = trayNow === 254
  const unit = trays(status.ams).find(
    (entry) =>
      finiteNumber(entry.id) === Math.floor(trayNow / 4),
  )
  const tray = (
    isExternal ? trays(status.vt_tray) : trays(unit?.tray)
  ).find((entry, index) =>
    isExternal
      ? index === 0
      : finiteNumber(entry.id) === trayNow % 4,
  )
  const name = tray
    ? textValue(tray.tray_sub_brands) ||
      textValue(tray.tray_type)
    : ""
  if (!tray || !name) {
    return undefined
  }
  const color = textValue(tray.tray_color)
  const place = isExternal
    ? "External spool"
    : `AMS ${Math.floor(trayNow / 4) + 1} slot ${(trayNow % 4) + 1}`
  return {
    filamentText: `${name} · ${place}`,
    ...(color
      ? { filamentColor: `#${color.slice(0, 6)}` }
      : {}),
  }
}

/** "0.4 mm hardened steel", from the primary nozzle Bambuddy reports. */
const activeNozzleText = (
  status: Record<string, unknown>,
) => {
  const nozzle = record(
    (Array.isArray(status.nozzles)
      ? status.nozzles
      : [])[0],
  )
  const diameter = textValue(nozzle.nozzle_diameter)
  if (!diameter) {
    return undefined
  }
  const type = textValue(nozzle.nozzle_type).replace(
    /_/g,
    " ",
  )
  return `${diameter} mm${type ? ` ${type}` : ""}`.trim()
}

const bambuddyFilamentColor = (
  value: unknown,
): string | undefined => {
  const text = textValue(value).trim().replace(/^#/, "")
  return /^[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(text)
    ? `#${text.slice(0, 6).toLowerCase()}`
    : undefined
}

const bambuddyPrinterFilaments = (
  status: Record<string, unknown>,
) => {
  const units = Array.isArray(status.ams)
    ? status.ams.map(record)
    : []
  const mappings = Array.isArray(status.ams_mapping)
    ? status.ams_mapping
    : []
  // Bambuddy uses global tray ids: 0-31 for AMS slots and 128-135 for AMS-HT.
  const usedGlobalIds = Array.from(
    new Set(
      mappings
        .map(finiteNumber)
        .filter(
          (globalId): globalId is number =>
            globalId !== undefined &&
            Number.isInteger(globalId) &&
            ((globalId >= 0 && globalId < 32) ||
              (globalId >= 128 && globalId <= 135)),
        ),
    ),
  )

  const filaments = usedGlobalIds.flatMap((globalId) => {
    const isAmsHt = globalId >= 128
    const amsId = isAmsHt
      ? globalId
      : Math.floor(globalId / 4)
    const slotId = isAmsHt ? 0 : globalId % 4
    const unit = units.find(
      (candidate) => finiteNumber(candidate.id) === amsId,
    )
    const trays =
      unit && Array.isArray(unit.tray)
        ? unit.tray.map(record)
        : []
    const tray = trays.find(
      (candidate) => finiteNumber(candidate.id) === slotId,
    )
    if (!tray) {
      return []
    }
    const amsName = isAmsHt
      ? `AMS HT ${String.fromCharCode(65 + amsId - 128)}`
      : `AMS ${amsId + 1}`
    const name =
      textValue(tray.tray_sub_brands) ||
      textValue(tray.tray_type) ||
      undefined
    const color = bambuddyFilamentColor(tray.tray_color)
    return [
      {
        globalId,
        ...(name ? { name } : {}),
        ...(color ? { color } : {}),
        location: `${amsName}, slot ${slotId + 1}`,
      },
    ]
  })

  // Bambuddy leaves `ams_mapping` empty on a live X1C status (measured
  // 2026-09-28 on three running printers), so the per-slot list here comes
  // from the print's archive record instead: `extra_data.filament_slots`
  // carries each filament's type, color and grams. The poll attaches that
  // list to the status as `archive_filament_slots`. An archive slot is the
  // 3MF filament index, not an AMS tray, so its location names the slot.
  if (filaments.length === 0) {
    const archiveSlots = Array.isArray(
      status.archive_filament_slots,
    )
      ? status.archive_filament_slots.map(record)
      : []
    archiveSlots.forEach((slot) => {
      const slotId = finiteNumber(slot.slot_id)
      const name = textValue(slot.type) || undefined
      const color = bambuddyFilamentColor(slot.color)
      const grams = finiteNumber(slot.used_g)
      if (slotId === undefined && !name && !color) return
      filaments.push({
        globalId: 1000 + (slotId ?? filaments.length + 1),
        ...(name ? { name } : {}),
        ...(color ? { color } : {}),
        location: `Filament ${slotId ?? filaments.length + 1}${grams !== undefined ? ` · ${grams.toFixed(grams < 10 ? 1 : 0)} g` : ""}`,
      })
    })
  }

  if (finiteNumber(status.tray_now) === 254) {
    const external = Array.isArray(status.vt_tray)
      ? status.vt_tray.map(record)[0]
      : undefined
    if (external) {
      const name =
        textValue(external.tray_sub_brands) ||
        textValue(external.tray_type) ||
        undefined
      const color = bambuddyFilamentColor(
        external.tray_color,
      )
      filaments.push({
        globalId: 254,
        ...(name ? { name } : {}),
        ...(color ? { color } : {}),
        location: "External spool",
      })
    }
  }

  return filaments
}

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
  const filament = activeFilament(status)
  const nozzleText = activeNozzleText(status)
  const assignedFilaments = bambuddyPrinterFilaments(status)
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
    ...(assignedFilaments.length
      ? {
          filaments: assignedFilaments.map(
            ({ name, color, location }) => ({
              ...(name ? { name } : {}),
              ...(color ? { color } : {}),
              location,
            }),
          ),
        }
      : {}),
    cameraPath: mediaUrl({
      channelId,
      printerId: id,
      kind: "stream",
    }),
    cameraIsLive: true,
    ...(filament ? filament : {}),
    ...(nozzleText ? { nozzleText } : {}),
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
    statusById: new Map<string, unknown>(),
    spools: [] as Record<string, unknown>[],
    assignments: [] as BambuddyAssignment[],
    /** Per-slot filament lists by archive id; an archive never changes. */
    archiveSlotsById: new Map<string, unknown[]>(),
    reader: initialSpoolReaderState(),
    inventoryRefresh: undefined as
      | Promise<void>
      | undefined,
  }
  const spoolsChannels = () =>
    context.channels.filter(
      (channel) => channel.type === "spools.v1",
    )
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
  const printerNames = () =>
    new Map(
      state.printers.map((printer) => [
        String(printer.id),
        textValue(printer.name),
      ]),
    )
  /** One spools snapshot for a channel: the reader state plus the inventory. */
  const spoolsSnapshot = (
    channelId: string,
  ): ContractData["spools.v1"] => ({
    ...state.reader,
    spools: state.spools.flatMap((spool) => {
      const normalized = normalizeBambuddySpool({
        data: spool,
        assignments: state.assignments,
        printerNames: printerNames(),
      })
      return normalized ? [normalized] : []
    }),
    printers: selectedIds(channelId).flatMap((id) => {
      const printer = normalizeBambuddySpoolsPrinter({
        data: state.statusById.get(id),
        assignments: state.assignments,
      })
      return printer ? [printer] : []
    }),
  })
  const publishSpools = (channelId: string) => {
    context.publish({
      channelId,
      data: spoolsSnapshot(channelId),
    })
  }
  const publishSpoolsEverywhere = () => {
    spoolsChannels().forEach((channel) => {
      publishSpools(channel.id)
    })
  }
  /** Bambuddy's spool list and slot assignments, kept for the next snapshot. */
  const readInventory = async () => {
    const readJson = (path: string) =>
      sourceRequest({ context, headers, path }).then(
        (response) => response.json(),
      )
    const [spools, assignments] = await Promise.all([
      readJson("/api/v1/inventory/spools"),
      readJson("/api/v1/inventory/assignments"),
    ])
    if (!Array.isArray(spools)) {
      throw new Error(
        "Bambuddy returned an invalid spool list.",
      )
    }
    state.spools = spools.map(record)
    state.assignments =
      normalizeBambuddyAssignments(assignments)
  }
  /** An out-of-cycle inventory read after an action or an inventory event. */
  const refreshInventory = () => {
    if (state.inventoryRefresh) {
      return state.inventoryRefresh
    }
    state.inventoryRefresh = (async () => {
      try {
        await readInventory()
        publishSpoolsEverywhere()
      } catch {
        // The next poll reports the source as unreachable.
      } finally {
        state.inventoryRefresh = undefined
      }
    })()
    return state.inventoryRefresh
  }
  const eventStream = createBambuddyEventStream({
    context,
    headers,
    onEvent: (event) => {
      const reader = reduceSpoolReaderEvent({
        state: state.reader,
        event,
      })
      const eventType = textValue(record(event).type)
      if (reader !== state.reader) {
        state.reader = reader
        publishSpoolsEverywhere()
      }
      if (
        (
          INVENTORY_REFRESH_EVENTS as readonly string[]
        ).includes(eventType)
      ) {
        void refreshInventory()
      }
    },
    onDisconnect: () => {
      if (state.reader.scale.isOnline) {
        state.reader = {
          ...state.reader,
          scale: { ...state.reader.scale, isOnline: false },
        }
        publishSpoolsEverywhere()
      }
    },
  })
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
    // The live status carries no per-slot filament list (see
    // bambuddyPrinterFilaments); the print's archive does. Read each
    // running print's archive once and hang its slots on the status.
    await Promise.all(
      statuses.map(async ([, status]) => {
        const printerStatus = record(status)
        const archiveId = finiteNumber(
          printerStatus.current_archive_id,
        )
        if (archiveId === undefined) return
        const key = String(archiveId)
        if (!state.archiveSlotsById.has(key)) {
          try {
            const archive = record(
              await (
                await sourceRequest({
                  context,
                  headers,
                  path: `/api/v1/archives/${encodeURIComponent(key)}`,
                })
              ).json(),
            )
            const slots = record(
              archive.extra_data,
            ).filament_slots
            state.archiveSlotsById.set(
              key,
              Array.isArray(slots) ? slots : [],
            )
          } catch {
            // A missing archive costs the detail list, not the card.
            return
          }
        }
        printerStatus.archive_filament_slots =
          state.archiveSlotsById.get(key) ?? []
      }),
    )
    state.statusById = new Map(statuses)
    if (spoolsChannels().length > 0) {
      await readInventory()
    }
    context.channels.forEach((channel) => {
      const selection = selectedIds(channel.id)
      if (channel.type === "spools.v1") {
        publishSpools(channel.id)
      } else if (channel.type === "cameras.v1") {
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
                  kind: "stream",
                }),
                isLive: true,
              })),
          },
        })
      } else {
        const printers = selection.flatMap((id) => {
          const printer = normalizeBambuddyPrinter({
            data: state.statusById.get(id),
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
  /** A Bambuddy write with the failure named for the person who pressed it. */
  const spoolRequest = async ({
    verb,
    path,
    method,
    body,
  }: {
    verb: string
    path: string
    method: "POST" | "PATCH"
    body: Record<string, unknown>
  }) => {
    try {
      const response = await sourceRequest({
        context,
        headers,
        path,
        method,
        body,
      })
      return record(await response.json().catch(() => ({})))
    } catch (error) {
      throw new Error(
        `Bambuddy could not ${verb}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
  const linkTag = ({
    spoolId,
    payload,
  }: {
    spoolId: number
    payload: Record<string, unknown>
  }) =>
    spoolRequest({
      verb: "link the tag",
      path: `/api/v1/inventory/spools/${spoolId}/link-tag`,
      method: "PATCH",
      body: {
        tag_uid: textValue(payload.tagUid),
        ...(textValue(payload.trayUuid)
          ? { tray_uuid: textValue(payload.trayUuid) }
          : {}),
        ...(textValue(payload.tagType)
          ? { tag_type: textValue(payload.tagType) }
          : {}),
      },
    })
  /**
   * The spool actions, each validated against the last inventory read before
   * Bambuddy is asked, and each followed by an immediate inventory refresh so
   * the panel does not wait a poll to see its own change.
   */
  const executeSpoolAction = async ({
    channelId,
    action,
    payload,
  }: {
    channelId: string
    action: string
    payload: Record<string, unknown>
  }) => {
    const command = action.replace(/^spool_/, "")
    if (
      !(SPOOL_ACTIONS as readonly string[]).includes(
        command,
      )
    ) {
      throw new Error(
        "This channel does not allow that spool action.",
      )
    }
    const spoolId = integerId(payload.spoolId)
    const spool = state.spools.find(
      (entry) => String(entry.id) === String(spoolId),
    )
    if (spoolId === undefined || !spool) {
      throw new Error(
        "That spool is not in the Bambuddy inventory.",
      )
    }
    const result = await (async () => {
      switch (command) {
        case "save_weight": {
          const grams = finiteNumber(payload.grams)
          if (grams === undefined || grams < 0) {
            throw new Error(
              "A scale weight in grams is required.",
            )
          }
          return spoolRequest({
            verb: "save the weight",
            path: "/api/v1/spoolbuddy/scale/update-spool-weight",
            method: "POST",
            body: {
              spool_id: spoolId,
              weight_grams: grams,
            },
          })
        }
        case "assign_slot": {
          const printerId = integerId(payload.printerId)
          const amsId = payload.amsId
          const trayId = payload.trayId
          if (
            printerId === undefined ||
            !selectedIds(channelId).includes(
              String(printerId),
            )
          ) {
            throw new Error(
              "That printer is not part of this channel.",
            )
          }
          if (
            !Number.isInteger(amsId) ||
            !Number.isInteger(trayId)
          ) {
            throw new Error(
              "An AMS id and a tray id are required.",
            )
          }
          return spoolRequest({
            verb: "assign the slot",
            path: "/api/v1/inventory/assignments",
            method: "POST",
            body: {
              spool_id: spoolId,
              printer_id: printerId,
              ams_id: amsId,
              tray_id: trayId,
            },
          })
        }
        case "copy_to_tag": {
          if (!textValue(payload.tagUid)) {
            throw new Error("A tag uid is required.")
          }
          const created = await spoolRequest({
            verb: "create the spool",
            path: "/api/v1/inventory/spools",
            method: "POST",
            body: Object.fromEntries(
              SPOOL_PRODUCT_FIELDS.filter(
                (field) =>
                  spool[field] !== undefined &&
                  spool[field] !== null,
              ).map((field) => [field, spool[field]]),
            ),
          })
          const newId = integerId(created.id)
          if (newId === undefined) {
            throw new Error(
              "Bambuddy created the spool without an id.",
            )
          }
          return linkTag({ spoolId: newId, payload })
        }
        default: {
          if (!textValue(payload.tagUid)) {
            throw new Error("A tag uid is required.")
          }
          return linkTag({ spoolId, payload })
        }
      }
    })()
    await refreshInventory()
    return result
  }
  const polling = pollingSource({
    context,
    poll,
    intervalSeconds:
      finiteNumber(context.source.settings.pollSeconds) ??
      5,
  })
  return {
    start: async () => {
      if (spoolsChannels().length > 0) {
        eventStream.start()
      }
      await polling.start()
    },
    dispose: () => {
      eventStream.dispose()
      polling.dispose()
    },
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
      const channel = context.channels.find(
        (entry) => entry.id === channelId,
      )
      if (channel?.type === "spools.v1") {
        return executeSpoolAction({
          channelId,
          action,
          payload,
        })
      }
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
        !["camera", "stream", "cover"].includes(kind ?? "")
      ) {
        throw new Error(
          "This media is not part of the selected printers.",
        )
      }
      // The camera snapshot and stream take Bambuddy's camera-stream token.
      // The plate cover no longer does: since Bambuddy #3025 that route
      // wants a separate media token, and a stream token on it answers 401
      // (measured 2026-09-28), which left every card with an empty picture.
      // The X-API-Key header alone is accepted there, so the cover carries
      // no token at all.
      const isCameraMedia =
        kind === "camera" || kind === "stream"
      const token = isCameraMedia
        ? `?token=${encodeURIComponent(await getCameraToken())}`
        : ""
      return sourceRequest({
        context,
        headers,
        path: `/api/v1/printers/${encodeURIComponent(assetId)}/${kind === "stream" ? "camera/stream" : kind === "camera" ? "camera/snapshot" : "cover"}${token}`,
        timeoutMilliseconds:
          kind === "camera" || kind === "stream"
            ? 20000
            : 10000,
        isStream: kind === "stream",
      })
    },
  }
}
