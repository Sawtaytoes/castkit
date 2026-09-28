import type { ContractData } from "@castkit/sdk/contracts"
import type { SourceContext } from "@castkit/sdk/plugin"
import {
  finiteNumber,
  record,
  sourceRequest,
  sourceUrl,
  textValue,
} from "./http.ts"

type SpoolsData = ContractData["spools.v1"]
type Spool = SpoolsData["spools"][number]
type SpoolsPrinter = SpoolsData["printers"][number]
type AmsUnit = SpoolsPrinter["ams"][number]
type AmsTray = AmsUnit["trays"][number]

const hexColorPattern = /^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/
/** Bambuddy reports an unreadable tag as an empty string or all zeros. */
const getIsReadableTag = (value: unknown) =>
  typeof value === "string" &&
  value.length > 0 &&
  !/^0+$/.test(value)
/** Remove a numeric prefix that exists only to order Bambuddy's printer list. */
export const normalizeBambuddyPrinterName = (
  value: unknown,
) => textValue(value).replace(/^\s*\d+\s*[-–·:]\s*/, "")
const hexColor = (value: unknown) => {
  const text = textValue(value).replace(/^#/, "")
  return hexColorPattern.test(text) ? text : undefined
}
const optionalText = (value: unknown) => {
  const text = textValue(value)
  return text ? text : undefined
}
const timestampMilliseconds = (value: unknown) => {
  const parsed = Date.parse(textValue(value))
  return Number.isFinite(parsed) ? parsed : undefined
}
/** Bambuddy's frontend names an AMS by letter and an AMS HT by its own range. */
const amsLabel = (id: number) =>
  id >= 0 && id <= 3
    ? `AMS ${String.fromCharCode(65 + id)}`
    : id >= 128 && id <= 135
      ? `AMS HT ${String.fromCharCode(65 + id - 128)}`
      : `AMS ${id}`
/** The tray key used to join an assignment to the tray it names. */
const trayKey = ({
  printerId,
  amsId,
  trayId,
}: {
  printerId: string
  amsId: number
  trayId: number
}) => `${printerId}:${amsId}:${trayId}`
/** A spool assignment resolved from Bambuddy's assignments list. */
export type BambuddyAssignment = {
  spoolId: string
  printerId: string
  printerName: string
  amsId: number
  trayId: number
}
/** Bambuddy's assignment rows, keeping only the ones with a complete slot. */
export const normalizeBambuddyAssignments = (
  data: unknown,
): BambuddyAssignment[] =>
  (Array.isArray(data) ? data : [])
    .map(record)
    .flatMap((assignment) => {
      const amsId = finiteNumber(assignment.ams_id)
      const trayId = finiteNumber(assignment.tray_id)
      if (
        assignment.spool_id === undefined ||
        assignment.printer_id === undefined ||
        amsId === undefined ||
        trayId === undefined
      ) {
        return []
      }
      return [
        {
          spoolId: String(assignment.spool_id),
          printerId: String(assignment.printer_id),
          printerName: textValue(assignment.printer_name),
          amsId,
          trayId,
        },
      ]
    })
/**
 * One Bambuddy inventory spool as the contract's spool. Bambuddy stores the
 * weight USED, so the remaining weight is the label weight less that; the
 * `extra_colors` field is a comma-joined list of hex stops.
 */
export const normalizeBambuddySpool = ({
  data,
  assignments = [],
  printerNames = new Map<string, string>(),
}: {
  data: unknown
  assignments?: BambuddyAssignment[]
  printerNames?: Map<string, string>
}): Spool | undefined => {
  const spool = record(data)
  if (
    spool.id === undefined ||
    !textValue(spool.material)
  ) {
    return undefined
  }
  const id = String(spool.id)
  const labelWeightGrams =
    finiteNumber(spool.label_weight) ?? 0
  const weightUsed = finiteNumber(spool.weight_used) ?? 0
  const extraColors = textValue(spool.extra_colors)
    .split(",")
    .map(hexColor)
    .filter((color): color is string => color !== undefined)
  const assignment = assignments.find(
    (entry) => entry.spoolId === id,
  )
  const lastScaleGrams = finiteNumber(
    spool.last_scale_weight,
  )
  const lastWeighedAtMs = timestampMilliseconds(
    spool.last_weighed_at,
  )
  return {
    id,
    material: textValue(spool.material),
    labelWeightGrams,
    coreWeightGrams: finiteNumber(spool.core_weight) ?? 0,
    remainingGrams: Math.max(
      0,
      labelWeightGrams - weightUsed,
    ),
    ...(optionalText(spool.brand)
      ? { brand: optionalText(spool.brand) }
      : {}),
    ...(optionalText(spool.subtype)
      ? { subtype: optionalText(spool.subtype) }
      : {}),
    ...(optionalText(spool.color_name)
      ? { colorName: optionalText(spool.color_name) }
      : {}),
    ...(hexColor(spool.rgba)
      ? { rgba: hexColor(spool.rgba) }
      : {}),
    ...(extraColors.length ? { extraColors } : {}),
    ...(optionalText(spool.effect_type)
      ? { effectType: optionalText(spool.effect_type) }
      : {}),
    ...(lastScaleGrams !== undefined
      ? { lastScaleGrams }
      : {}),
    ...(lastWeighedAtMs !== undefined
      ? { lastWeighedAtMs }
      : {}),
    ...(optionalText(spool.tag_uid)
      ? { tagUid: optionalText(spool.tag_uid) }
      : {}),
    ...(optionalText(spool.tray_uuid)
      ? { trayUuid: optionalText(spool.tray_uuid) }
      : {}),
    ...(optionalText(spool.tag_type)
      ? { tagType: optionalText(spool.tag_type) }
      : {}),
    ...(assignment
      ? {
          location: {
            printerId: assignment.printerId,
            printerName:
              assignment.printerName ||
              printerNames.get(assignment.printerId) ||
              "",
            amsId: assignment.amsId,
            trayId: assignment.trayId,
          },
        }
      : {}),
  }
}
/**
 * One AMS tray from Bambuddy's printer status. A readable tag or an exact
 * inventory assignment is `read`; a spool Bambuddy senses but cannot identify
 * is `untagged` — it signals presence through a `tray_type`, the firmware's
 * `exists` bit, or tray state 10/11 — and anything else is `empty`.
 */
export const normalizeBambuddyTray = ({
  data,
  spool,
}: {
  data: unknown
  spool?: Spool
}): AmsTray | undefined => {
  const tray = record(data)
  const id = finiteNumber(tray.id)
  if (id === undefined) {
    return undefined
  }
  const material = optionalText(tray.tray_type)
  const trayState = finiteNumber(tray.state)
  const hasSpool =
    material !== undefined ||
    tray.exists === true ||
    trayState === 10 ||
    trayState === 11
  const hasReadableTag = getIsReadableTag(tray.tag_uid)
  const assignedSpool = hasSpool ? spool : undefined
  const state = !hasSpool
    ? "empty"
    : hasReadableTag || assignedSpool
      ? "read"
      : "untagged"
  const reportedRemainPercent = finiteNumber(tray.remain)
  const inventoryRemainPercent =
    assignedSpool && assignedSpool.labelWeightGrams > 0
      ? (assignedSpool.remainingGrams /
          assignedSpool.labelWeightGrams) *
        100
      : undefined
  const remainPercent = hasReadableTag
    ? reportedRemainPercent
    : (inventoryRemainPercent ?? reportedRemainPercent)
  const spoolMaterial = assignedSpool?.material ?? material
  const spoolSubtype =
    assignedSpool?.subtype ??
    optionalText(tray.tray_sub_brands)
  const spoolRgba =
    assignedSpool?.rgba ?? hexColor(tray.tray_color)
  return {
    id,
    state,
    ...(spoolMaterial ? { material: spoolMaterial } : {}),
    ...(spoolSubtype ? { subtype: spoolSubtype } : {}),
    ...(assignedSpool?.colorName
      ? { colorName: assignedSpool.colorName }
      : {}),
    ...(spoolRgba ? { rgba: spoolRgba } : {}),
    ...(remainPercent !== undefined && remainPercent >= 0
      ? { remainPercent: Math.min(100, remainPercent) }
      : {}),
    ...(assignedSpool ? { spoolId: assignedSpool.id } : {}),
  }
}
/**
 * A printer's AMS units from Bambuddy's `/printers/{id}/status`, with the
 * assignments joined onto their trays. Bambuddy folds a raw humidity percent
 * and the AMS's own 1–5 humidity index into one field, so only a value above
 * the index range is reported as a percent.
 */
export const normalizeBambuddySpoolsPrinter = ({
  data,
  assignments = [],
  spools = [],
}: {
  data: unknown
  assignments?: BambuddyAssignment[]
  spools?: readonly Spool[]
}): SpoolsPrinter | undefined => {
  const status = record(data)
  if (status.id === undefined) {
    return undefined
  }
  const id = String(status.id)
  const spoolById = new Map(
    spools.map((spool) => [spool.id, spool]),
  )
  const spoolByTray = new Map(
    assignments
      .filter((assignment) => assignment.printerId === id)
      .map((assignment) => [
        trayKey(assignment),
        spoolById.get(assignment.spoolId),
      ]),
  )
  const ams = (Array.isArray(status.ams) ? status.ams : [])
    .map(record)
    .flatMap((unit): AmsUnit[] => {
      const amsId = finiteNumber(unit.id)
      if (amsId === undefined) {
        return []
      }
      const humidity = finiteNumber(unit.humidity)
      const temperature = finiteNumber(unit.temp)
      return [
        {
          id: amsId,
          label: amsLabel(amsId),
          ...(humidity !== undefined && humidity > 5
            ? { humidityPercent: humidity }
            : {}),
          ...(temperature !== undefined
            ? { temperatureCelsius: temperature }
            : {}),
          trays: (Array.isArray(unit.tray)
            ? unit.tray
            : []
          ).flatMap((tray) => {
            const trayId = finiteNumber(record(tray).id)
            const normalized = normalizeBambuddyTray({
              data: tray,
              ...(trayId !== undefined
                ? {
                    spool: spoolByTray.get(
                      trayKey({
                        printerId: id,
                        amsId,
                        trayId,
                      }),
                    ),
                  }
                : {}),
            })
            return normalized ? [normalized] : []
          }),
        },
      ]
    })
  return {
    id,
    name: normalizeBambuddyPrinterName(status.name),
    isOnline: status.connected === true,
    ams,
  }
}
/** The live half of the snapshot: what the scale and the tag reader last said. */
export type SpoolReaderState = {
  scale: SpoolsData["scale"]
  tag: SpoolsData["tag"]
}
/** Nothing on the reader and no scale reading yet: the state before any event. */
export const initialSpoolReaderState =
  (): SpoolReaderState => ({
    scale: { grams: 0, isStable: false, isOnline: false },
    tag: { state: "none" },
  })
/**
 * Fold one Bambuddy WebSocket event into the reader state. Bambuddy sends
 * every event flat — `{ type, device_id, ...fields }` with no `data` wrapper.
 * A matched tag carries the spool as a nested `spool: { id }`; an unknown tag
 * carries `tag_type`; the SpoolBuddy going offline takes the scale with it.
 * Any event that is not about the reader returns the same state.
 */
export const reduceSpoolReaderEvent = ({
  state,
  event,
  nowMs = Date.now(),
}: {
  state: SpoolReaderState
  event: unknown
  nowMs?: number
}): SpoolReaderState => {
  const message = record(event)
  switch (textValue(message.type)) {
    case "spoolbuddy_weight": {
      const grams =
        finiteNumber(message.weight_grams) ??
        finiteNumber(message.grams)
      if (grams === undefined) {
        return state
      }
      return {
        ...state,
        scale: {
          grams,
          isStable: message.stable === true,
          isOnline: true,
          updatedAtMs: nowMs,
        },
      }
    }
    case "spoolbuddy_tag_matched": {
      const spoolId =
        record(message.spool).id ?? message.spool_id
      return {
        ...state,
        tag: {
          state: "matched",
          ...(optionalText(message.tag_uid)
            ? { uid: optionalText(message.tag_uid) }
            : {}),
          ...(optionalText(message.tray_uuid)
            ? { trayUuid: optionalText(message.tray_uuid) }
            : {}),
          ...(optionalText(message.tag_type)
            ? { tagType: optionalText(message.tag_type) }
            : {}),
          ...(spoolId !== undefined && spoolId !== null
            ? { spoolId: String(spoolId) }
            : {}),
          updatedAtMs: nowMs,
        },
      }
    }
    case "spoolbuddy_unknown_tag":
      return {
        ...state,
        tag: {
          state: "unknown",
          ...(optionalText(message.tag_uid)
            ? { uid: optionalText(message.tag_uid) }
            : {}),
          ...(optionalText(message.tray_uuid)
            ? { trayUuid: optionalText(message.tray_uuid) }
            : {}),
          ...(optionalText(message.tag_type)
            ? { tagType: optionalText(message.tag_type) }
            : {}),
          updatedAtMs: nowMs,
        },
      }
    case "spoolbuddy_tag_removed":
      return {
        ...state,
        tag: { state: "none", updatedAtMs: nowMs },
      }
    case "spoolbuddy_offline":
      return {
        ...state,
        scale: {
          ...state.scale,
          isOnline: false,
          updatedAtMs: nowMs,
        },
      }
    default:
      return state
  }
}
/** The events after which Bambuddy's inventory is worth reading again at once. */
export const INVENTORY_REFRESH_EVENTS = [
  "inventory_changed",
  "spoolbuddy_tag_matched",
  "spoolbuddy_tag_written",
] as const
/** The subset of a browser `WebSocket` the event stream drives. */
export type EventSocket = {
  addEventListener: (
    type: "open" | "message" | "close" | "error",
    listener: (event: { data?: unknown }) => void,
  ) => void
  close: () => void
}
/**
 * Bambuddy's `/api/v1/ws` feed for one source: a short-lived token from
 * `POST /auth/ws-token`, then every broadcast as a parsed JSON message.
 * There is no state replay for the reader, so the caller starts from
 * `initialSpoolReaderState` and waits. Reconnects with a bounded backoff on
 * close or error, and `onDisconnect` fires when a live feed is lost.
 */
export const createBambuddyEventStream = ({
  context,
  headers,
  onEvent,
  onDisconnect = () => {},
  createSocket = (url) => new WebSocket(url),
  initialBackoffMs = 1000,
  maximumBackoffMs = 30000,
}: {
  context: SourceContext
  headers: Record<string, string>
  onEvent: (event: unknown) => void
  onDisconnect?: () => void
  createSocket?: (url: string) => EventSocket
  initialBackoffMs?: number
  maximumBackoffMs?: number
}) => {
  const state = {
    isStopped: false,
    backoffMs: initialBackoffMs,
    socket: undefined as EventSocket | undefined,
    timer: undefined as
      | ReturnType<typeof setTimeout>
      | undefined,
  }
  const getIsLive = () =>
    !state.isStopped && !context.signal.aborted
  const scheduleReconnect = () => {
    if (!getIsLive() || state.timer) {
      return
    }
    state.timer = setTimeout(() => {
      state.timer = undefined
      void connect()
    }, state.backoffMs)
    state.timer.unref()
    state.backoffMs = Math.min(
      maximumBackoffMs,
      state.backoffMs * 2,
    )
  }
  const socketUrl = async () => {
    const response = await sourceRequest({
      context,
      headers,
      path: "/api/v1/auth/ws-token",
      method: "POST",
    })
    const token = textValue(
      record(await response.json()).token,
    )
    if (!token) {
      throw new Error(
        "Bambuddy did not grant event access.",
      )
    }
    const url = new URL(
      sourceUrl({
        baseUrl: context.source.settings.url,
        path: `/api/v1/ws?token=${encodeURIComponent(token)}`,
      }),
    )
    url.protocol =
      url.protocol === "https:" ? "wss:" : "ws:"
    return url.toString()
  }
  const connect = async () => {
    if (!getIsLive()) {
      return
    }
    const closed = { has: false }
    const handleLoss = () => {
      if (closed.has) {
        return
      }
      closed.has = true
      state.socket = undefined
      onDisconnect()
      scheduleReconnect()
    }
    try {
      const socket = createSocket(await socketUrl())
      state.socket = socket
      socket.addEventListener("open", () => {
        state.backoffMs = initialBackoffMs
      })
      socket.addEventListener("message", (event) => {
        if (typeof event.data !== "string") {
          return
        }
        try {
          onEvent(JSON.parse(event.data))
        } catch {
          // A frame that is not JSON is not an event.
        }
      })
      socket.addEventListener("close", handleLoss)
      socket.addEventListener("error", handleLoss)
    } catch {
      handleLoss()
    }
  }
  return {
    start: () => {
      void connect()
    },
    dispose: () => {
      state.isStopped = true
      if (state.timer) {
        clearTimeout(state.timer)
      }
      state.socket?.close()
      state.socket = undefined
    },
  }
}
