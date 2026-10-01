import type { ContractData } from "@castkit/sdk/contracts"
import type { SourceFactory } from "@castkit/sdk/plugin"
import {
  type BambuddyAssignment,
  createBambuddyEventStream,
  INVENTORY_REFRESH_EVENTS,
  initialSpoolReaderState,
  normalizeBambuddyAssignments,
  normalizeBambuddyPrinterName,
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
import { createPrinterHls } from "./printerHls.ts"

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
      ? {
          filamentColor: `#${color.length === 8 && !/ff$/i.test(color) ? color : color.slice(0, 6)}`,
        }
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

/** A validated tray color, keeping the alpha that inventory swatches draw. */
const bambuddyFilamentRgba = (value: unknown) =>
  bambuddyFilamentColor(value)
    ? textValue(value).trim().replace(/^#/, "")
    : undefined

/** A tray in the printer's live AMS state. */
type BambuddyAmsTray = {
  amsId: number
  trayId: number
  tray: Record<string, unknown>
}

/** Every AMS tray with an id that Bambuddy currently reports. */
const bambuddyAmsTrays = (
  status: Record<string, unknown>,
): BambuddyAmsTray[] =>
  (Array.isArray(status.ams) ? status.ams : []).flatMap(
    (rawUnit) => {
      const unit = record(rawUnit)
      const amsId = finiteNumber(unit.id)
      if (
        amsId === undefined ||
        !Array.isArray(unit.tray)
      ) {
        return []
      }
      return unit.tray.flatMap((rawTray) => {
        const tray = record(rawTray)
        const trayId = finiteNumber(tray.id)
        return trayId === undefined
          ? []
          : [{ amsId, trayId, tray }]
      })
    },
  )

/** Human-readable location for one physical AMS slot. */
const bambuddyAmsLocation = ({
  amsId,
  trayId,
}: {
  amsId: number
  trayId: number
}) => {
  const amsName =
    amsId >= 128
      ? `AMS HT ${String.fromCharCode(65 + amsId - 128)}`
      : `AMS ${amsId + 1}`
  return `${amsName}, slot ${trayId + 1}`
}

/** A Bambuddy inventory spool sitting in one AMS tray of this printer. */
type LoadedSpool = {
  amsId: number
  trayId: number
  spool: Record<string, unknown>
}

/** The inventory spools assigned to one printer's trays. */
const loadedSpoolsFor = ({
  printerId,
  spools,
  assignments,
}: {
  printerId: string
  spools: readonly Record<string, unknown>[]
  assignments: readonly BambuddyAssignment[]
}): LoadedSpool[] =>
  assignments
    .filter(
      (assignment) => assignment.printerId === printerId,
    )
    .flatMap(({ amsId, trayId, spoolId }) => {
      const spool = spools.find(
        (candidate) => String(candidate.id) === spoolId,
      )
      return spool ? [{ amsId, trayId, spool }] : []
    })

/**
 * Inventory product details for a filament. A loaded slot narrows the match;
 * otherwise only values shared by every matching inventory product survive.
 * Inventory elsewhere can name a product, but cannot supply its AMS location.
 */
const filamentInventoryDetails = ({
  loadedSpools,
  spools,
  color,
  material,
}: {
  loadedSpools: readonly LoadedSpool[]
  spools: readonly Record<string, unknown>[]
  color: string | undefined
  material: string | undefined
}) => {
  const getIsMatch = (spool: Record<string, unknown>) =>
    color !== undefined &&
    bambuddyFilamentColor(spool.rgba) === color &&
    (!material ||
      textValue(spool.material).toLowerCase() ===
        material.toLowerCase())
  const loadedMatches = loadedSpools.filter(({ spool }) =>
    getIsMatch(spool),
  )
  const matches = (
    loadedMatches.length
      ? loadedMatches.map(({ spool }) => spool)
      : spools.filter(getIsMatch)
  ).flatMap((data) => {
    const spool = normalizeBambuddySpool({ data })
    return spool ? [spool] : []
  })
  const unique = (values: (string | undefined)[]) => {
    const distinct = Array.from(
      new Set(values.filter(Boolean)),
    )
    return distinct.length === 1 ? distinct[0] : undefined
  }
  const colorName = unique(
    matches.map((spool) => spool.colorName),
  )
  const subtype = unique(
    matches.map((spool) => spool.subtype),
  )
  const brand = unique(matches.map((spool) => spool.brand))
  // Opacity, extra bands, and finish describe one product together. A solid
  // black spool and a galaxy black spool must never borrow each other's finish.
  const appearances = matches.map(
    ({ rgba, extraColors, effectType }) => ({
      ...(rgba ? { rgba } : {}),
      ...(extraColors ? { extraColors } : {}),
      ...(effectType ? { effectType } : {}),
    }),
  )
  const appearance =
    new Set(
      appearances.map((value) => JSON.stringify(value)),
    ).size === 1
      ? appearances[0]
      : undefined
  const location =
    loadedMatches.length === 1
      ? bambuddyAmsLocation(loadedMatches[0])
      : undefined
  return {
    ...(colorName ? { colorName } : {}),
    ...(subtype ? { subtype } : {}),
    ...(brand ? { brand } : {}),
    ...appearance,
    ...(location ? { location } : {}),
  }
}

/** Decode only real physical tray ids, never an unused slicer slot (-1). */
const mappedAmsTray = (value: unknown) => {
  const globalId = finiteNumber(value)
  if (
    globalId === undefined ||
    !Number.isInteger(globalId)
  ) {
    return undefined
  }
  if (globalId >= 0 && globalId < 32) {
    return {
      globalId,
      amsId: Math.floor(globalId / 4),
      trayId: globalId % 4,
    }
  }
  if (globalId >= 128 && globalId <= 135) {
    return { globalId, amsId: globalId, trayId: 0 }
  }
  return undefined
}

const bambuddyPrinterFilaments = (
  status: Record<string, unknown>,
  loadedSpools: readonly LoadedSpool[] = [],
  spools: readonly Record<string, unknown>[] = [],
) => {
  const units = Array.isArray(status.ams)
    ? status.ams.map(record)
    : []
  const archiveSlots = Array.isArray(
    status.archive_filament_slots,
  )
    ? status.archive_filament_slots.map(record)
    : []
  const mappings =
    Array.isArray(status.print_ams_mapping) &&
    status.print_ams_mapping.length
      ? status.print_ams_mapping
      : Array.isArray(status.ams_mapping)
        ? status.ams_mapping
        : []
  // Bambuddy uses global tray ids: 0-31 for AMS slots and 128-135 for AMS-HT.
  const usedGlobalIds = Array.from(
    new Set(
      (archiveSlots.length ? [] : mappings)
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
    const inventory = filamentInventoryDetails({
      loadedSpools: loadedSpools.filter(
        (loaded) =>
          loaded.amsId === amsId &&
          loaded.trayId === slotId,
      ),
      spools,
      color,
      material: textValue(tray.tray_type) || undefined,
    })
    const {
      subtype,
      location: inventoryLocation,
      ...details
    } = inventory
    const productName =
      subtype && textValue(tray.tray_type)
        ? `${textValue(tray.tray_type)} ${subtype}`
        : name
    const rgba =
      details.rgba ?? bambuddyFilamentRgba(tray.tray_color)
    return [
      {
        globalId,
        ...(productName ? { name: productName } : {}),
        ...(color ? { color } : {}),
        ...(rgba ? { rgba } : {}),
        ...details,
        location: `${amsName}, slot ${slotId + 1}`,
      },
    ]
  })

  // Bambuddy leaves `ams_mapping` empty on a live X1C status (measured
  // 2026-09-28 on three running printers), so the per-slot list here comes
  // from the print's archive record instead: `extra_data.filament_slots`
  // carries each filament's type, color and grams. The poll attaches that
  // list to the status as `archive_filament_slots`. An archive slot is the
  // 3MF filament index, not an AMS tray. Use the dispatched queue mapping
  // first; otherwise material and color must identify one loaded AMS slot.
  if (filaments.length === 0) {
    const amsTrays = bambuddyAmsTrays(status)
    const hasLiveAmsDetails = amsTrays.some(
      ({ tray }) =>
        Boolean(bambuddyFilamentColor(tray.tray_color)) ||
        Boolean(textValue(tray.tray_type)),
    )
    const activeExternalTray =
      finiteNumber(status.tray_now) === 254 &&
      Array.isArray(status.vt_tray)
        ? record(status.vt_tray[0])
        : undefined
    archiveSlots.forEach((slot) => {
      const slotId = finiteNumber(slot.slot_id)
      const material = textValue(slot.type) || undefined
      const color = bambuddyFilamentColor(slot.color)
      const grams = finiteNumber(slot.used_g)
      if (slotId === undefined && !material && !color)
        return
      const matchingAmsTrays = amsTrays.filter(
        ({ tray }) =>
          color !== undefined &&
          bambuddyFilamentColor(tray.tray_color) ===
            color &&
          (!material ||
            textValue(tray.tray_type).toLowerCase() ===
              material.toLowerCase()),
      )
      const isActiveExternalMatch = Boolean(
        color &&
          activeExternalTray &&
          bambuddyFilamentColor(
            activeExternalTray.tray_color,
          ) === color &&
          (!material ||
            !textValue(activeExternalTray.tray_type) ||
            textValue(
              activeExternalTray.tray_type,
            ).toLowerCase() === material.toLowerCase()),
      )
      const mapping =
        slotId !== undefined
          ? mappedAmsTray(mappings[slotId - 1])
          : undefined
      const isMappedExternal =
        slotId !== undefined && mappings[slotId - 1] === 254
      const assignedSpools = mapping
        ? loadedSpools.filter(
            (loaded) =>
              loaded.amsId === mapping.amsId &&
              loaded.trayId === mapping.trayId,
          )
        : loadedSpools
      const {
        colorName,
        subtype,
        location: inventoryLocation,
        ...appearance
      } = filamentInventoryDetails({
        loadedSpools: assignedSpools,
        spools,
        color,
        material,
      })
      const trayNames = Array.from(
        new Set(
          matchingAmsTrays
            .map(
              ({ tray }) =>
                textValue(tray.tray_sub_brands) ||
                textValue(tray.tray_type),
            )
            .filter(Boolean),
        ),
      )
      const trayName =
        trayNames.length === 1 ? trayNames[0] : undefined
      const matchedAmsTray = isMappedExternal
        ? undefined
        : mapping
          ? {
              ...mapping,
              tray:
                amsTrays.find(
                  (tray) =>
                    tray.amsId === mapping.amsId &&
                    tray.trayId === mapping.trayId,
                )?.tray ?? {},
            }
          : matchingAmsTrays.length === 1
            ? matchingAmsTrays[0]
            : undefined
      const matchedSpool = matchedAmsTray
        ? loadedSpools.find(
            (loaded) =>
              loaded.amsId === matchedAmsTray.amsId &&
              loaded.trayId === matchedAmsTray.trayId,
          )
        : undefined
      const matchedColorName =
        textValue(matchedSpool?.spool.color_name) ||
        colorName
      // "PLA" plus the matched spool's "Basic" reads as the tray does.
      // If live AMS state has multiple different profiles for this material
      // and color, keep the archive material instead of guessing a profile.
      const safeSubtype =
        !mapping && matchingAmsTrays.length > 1 && !trayName
          ? undefined
          : subtype
      const name =
        material &&
        safeSubtype &&
        !material.includes(safeSubtype)
          ? `${material} ${safeSubtype}`
          : trayName || material
      const amsLocation = isMappedExternal
        ? "External spool"
        : matchedAmsTray
          ? !mapping && isActiveExternalMatch
            ? undefined
            : bambuddyAmsLocation(matchedAmsTray)
          : matchingAmsTrays.length === 0 &&
              !hasLiveAmsDetails &&
              !isActiveExternalMatch
            ? inventoryLocation
            : undefined
      const printLocation = `Filament ${slotId ?? filaments.length + 1}${grams !== undefined ? ` · ${grams.toFixed(grams < 10 ? 1 : 0)} g` : ""}`
      const rgba =
        appearance.rgba ??
        bambuddyFilamentRgba(
          matchedAmsTray?.tray.tray_color,
        )
      filaments.push({
        globalId:
          (isMappedExternal ? 254 : mapping?.globalId) ??
          1000 + (slotId ?? filaments.length + 1),
        ...(name ? { name } : {}),
        ...(color ? { color } : {}),
        ...(matchedColorName
          ? { colorName: matchedColorName }
          : {}),
        ...(rgba ? { rgba } : {}),
        ...appearance,
        location: [amsLocation, printLocation]
          .filter(Boolean)
          .join(" · "),
      })
    })
  }

  if (
    finiteNumber(status.tray_now) === 254 &&
    !filaments.some((filament) => filament.globalId === 254)
  ) {
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
      const rgba = bambuddyFilamentRgba(external.tray_color)
      filaments.push({
        globalId: 254,
        ...(name ? { name } : {}),
        ...(color ? { color } : {}),
        ...(rgba ? { rgba } : {}),
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
  spools = [],
  assignments = [],
  cameraFormat,
}: {
  data: unknown
  channelId: string
  /** Bambuddy's inventory, so a slot can carry its spool's color name. */
  spools?: readonly Record<string, unknown>[]
  assignments?: readonly BambuddyAssignment[]
  cameraFormat?: "hls"
}):
  | ContractData["printers.v1"]["printers"][number]
  | undefined => {
  const status = record(data)
  const state = textValue(status.state)
  const isRunning = [
    "RUNNING",
    "PAUSE",
    "PREPARE",
  ].includes(state)
  const isAwaitingClear =
    status.awaiting_plate_clear === true && !isRunning
  if (
    !status.connected ||
    (!isRunning && !isAwaitingClear)
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
  const assignedFilaments = bambuddyPrinterFilaments(
    status,
    loadedSpoolsFor({
      printerId: String(status.id),
      spools,
      assignments,
    }),
    spools,
  )
  return {
    id,
    // The owner names his printers "1 - Magi", "2 - Foopie" so Bambuddy
    // lists them in order. The number is ordering, not the name; the card
    // draws its own badge, so the prefix comes off here.
    name: normalizeBambuddyPrinterName(status.name),
    jobName:
      textValue(status.subtask_name) ||
      textValue(status.current_print) ||
      textValue(status.gcode_file),
    percent: Math.min(
      100,
      Math.max(0, finiteNumber(status.progress) ?? 0),
    ),
    state: isAwaitingClear
      ? state === "FAILED"
        ? "failed"
        : "finished"
      : state === "PAUSE"
        ? "paused"
        : state === "PREPARE"
          ? "preparing"
          : "printing",
    ...(!isAwaitingClear && remainingMinutes !== undefined
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
            ({ globalId, ...filament }) => filament,
          ),
        }
      : {}),
    cameraPath: mediaUrl({
      channelId,
      printerId: id,
      kind: cameraFormat ?? "stream",
    }),
    cameraIsLive: true,
    ...(cameraFormat ? { cameraFormat } : {}),
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
  const hls = createPrinterHls()
  const configuredCodes = (() => {
    try {
      return record(
        JSON.parse(
          context.secrets.cameraAccessCodes ?? "{}",
        ),
      )
    } catch {
      return {}
    }
  })()
  const cameraCode = (id: string) =>
    textValue(configuredCodes[id])
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
  ): ContractData["spools.v1"] => {
    const spools = state.spools.flatMap((spool) => {
      const normalized = normalizeBambuddySpool({
        data: spool,
        assignments: state.assignments,
        printerNames: printerNames(),
      })
      return normalized ? [normalized] : []
    })
    return {
      ...state.reader,
      spools,
      printers: selectedIds(channelId).flatMap((id) => {
        const printer = normalizeBambuddySpoolsPrinter({
          data: state.statusById.get(id),
          assignments: state.assignments,
          spools,
        })
        return printer ? [printer] : []
      }),
    }
  }
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
    // Queue dispatch saves the exact slicer-index map even when a printer's
    // live AMS report has missing or stale trays. Read this as optional detail:
    // older Bambuddy installs or restricted API keys can still show printers.
    const hasActiveArchives = statuses.some(
      ([, data]) =>
        finiteNumber(record(data).current_archive_id) !==
        undefined,
    )
    const queue = hasActiveArchives
      ? await sourceRequest({
          context,
          headers,
          path: "/api/v1/queue/",
        })
          .then((response) => response.json())
          .catch(() => [])
      : []
    const queueItems = Array.isArray(queue)
      ? queue.map(record)
      : []
    statuses.forEach(([printerId, data]) => {
      const status = record(data)
      const archiveId = finiteNumber(
        status.current_archive_id,
      )
      const item = queueItems.find(
        (candidate) =>
          candidate.status === "printing" &&
          String(candidate.printer_id) === printerId &&
          archiveId !== undefined &&
          finiteNumber(candidate.archive_id) === archiveId,
      )
      if (Array.isArray(item?.ams_mapping)) {
        status.print_ams_mapping = item.ams_mapping
      }
    })
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
    // The spools channels are built from the inventory, and the printer
    // card names each slot's spool color from it. A failed inventory read
    // is the SPOOLS channels' fault to report, never the printers': on
    // 2026-09-28 Bambuddy's /api/v1/inventory/spools answered 500 for hours
    // while its printers answered fine, and the whole poll threw, so the
    // printer cards went dark on every screen. The last good inventory
    // stays in `state` for the cards.
    const inventoryError = await (spoolsChannels().length >
      0 ||
    context.channels.some(
      (channel) => channel.type === "printers.v1",
    )
      ? readInventory().then(
          () => undefined,
          (error: unknown) =>
            `Bambuddy inventory: ${error instanceof Error ? error.message : String(error)}`,
        )
      : Promise.resolve(undefined))
    context.channels.forEach((channel) => {
      const selection = selectedIds(channel.id)
      if (channel.type === "spools.v1") {
        if (inventoryError) {
          context.reportError({
            channelId: channel.id,
            error: inventoryError,
          })
        } else {
          publishSpools(channel.id)
        }
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
                  kind: cameraCode(String(printer.id))
                    ? "hls"
                    : "stream",
                }),
                isLive: true,
                ...(cameraCode(String(printer.id))
                  ? { format: "hls" as const }
                  : {}),
              })),
          },
        })
      } else {
        const printers = selection.flatMap((id) => {
          const printer = normalizeBambuddyPrinter({
            data: state.statusById.get(id),
            channelId: channel.id,
            spools: state.spools,
            assignments: state.assignments,
            cameraFormat: cameraCode(id)
              ? "hls"
              : undefined,
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
      hls.dispose()
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
        ![
          "pause",
          "resume",
          "stop",
          "clear_plate",
        ].includes(command) ||
        !selectedIds(channelId).includes(printerId)
      ) {
        throw new Error(
          "This channel does not allow that printer action.",
        )
      }
      if (command === "clear_plate") {
        const status = record(
          await (
            await sourceRequest({
              context,
              headers,
              path: `/api/v1/printers/${encodeURIComponent(printerId)}/status`,
            })
          ).json(),
        )
        if (
          !status.connected ||
          status.awaiting_plate_clear !== true ||
          ["RUNNING", "PAUSE", "PREPARE"].includes(
            textValue(status.state),
          )
        ) {
          throw new Error(
            "This printer is not awaiting plate clearance.",
          )
        }
      }
      const response = await sourceRequest({
        context,
        headers,
        path: `/api/v1/printers/${encodeURIComponent(printerId)}/${command === "clear_plate" ? "clear-plate" : `print/${command}`}`,
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
    getMedia: async ({
      channelId,
      assetId,
      kind,
      query,
    }) => {
      if (
        !selectedIds(channelId).includes(assetId) ||
        !["camera", "stream", "cover", "hls"].includes(
          kind ?? "",
        )
      ) {
        throw new Error(
          "This media is not part of the selected printers.",
        )
      }
      if (kind === "hls") {
        const accessCode = cameraCode(assetId)
        const printer = state.printers.find(
          (entry) => String(entry.id) === assetId,
        )
        const address = textValue(
          printer?.ip_address || printer?.ip,
        )
        if (!accessCode || !address)
          throw new Error(
            "Printer camera is not configured",
          )
        return hls.fetchResource({
          id: assetId,
          address,
          accessCode,
          resource: query?.resource,
        })
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
