import { builtinContractSchemas } from "@castkit/sdk/contracts"
import { expect, test, vi } from "vitest"
import { sourceContext } from "./__fixtures__/sourceContext.ts"
import {
  createBambuddyEventStream,
  type EventSocket,
  initialSpoolReaderState,
  normalizeBambuddyAssignments,
  normalizeBambuddySpool,
  normalizeBambuddySpoolsPrinter,
  reduceSpoolReaderEvent,
} from "./bambuddySpools.ts"

const assignments = normalizeBambuddyAssignments([
  {
    id: 1,
    spool_id: 7,
    printer_id: 2,
    printer_name: "Printer",
    ams_id: 0,
    tray_id: 1,
  },
  {
    id: 2,
    spool_id: 8,
    printer_id: 2,
    ams_id: "x",
    tray_id: 0,
  },
])

test("a Bambuddy status becomes AMS trays in all three states with assignments joined on", () => {
  const assignedSpool = normalizeBambuddySpool({
    data: {
      id: 7,
      material: "PLA",
      subtype: "Matte",
      color_name: "Ash Gray",
      rgba: "858585FF",
      label_weight: 1000,
      weight_used: 320,
    },
  })
  const printer = normalizeBambuddySpoolsPrinter({
    data: {
      id: 2,
      name: "2 - Printer",
      connected: true,
      ams: [
        {
          id: 0,
          humidity: 41,
          temp: 27.5,
          tray: [
            {
              id: 0,
              tray_type: "PLA",
              tray_sub_brands: "PLA Basic",
              tray_color: "FF0000FF",
              remain: 62,
              tag_uid: "0123456789ABCDEF",
              tray_uuid: "0123456789ABCDEF0123456789ABCDEF",
              state: 11,
            },
            {
              id: 1,
              tray_type: "PETG",
              tray_color: "#00FF00FF",
              remain: -1,
              tag_uid: "0000000000000000",
              state: 11,
            },
            { id: 2 },
            {
              id: 3,
              tray_type: "",
              exists: true,
              state: 10,
            },
          ],
        },
        {
          id: 128,
          humidity: 3,
          tray: [{ id: 0, state: 9 }],
        },
      ],
    },
    assignments,
    spools: assignedSpool ? [assignedSpool] : [],
  })
  expect(printer).toEqual({
    id: "2",
    name: "Printer",
    isOnline: true,
    ams: [
      {
        id: 0,
        label: "AMS A",
        humidityPercent: 41,
        temperatureCelsius: 27.5,
        trays: [
          {
            id: 0,
            state: "read",
            material: "PLA",
            subtype: "PLA Basic",
            rgba: "FF0000FF",
            remainPercent: 62,
          },
          {
            id: 1,
            state: "read",
            material: "PLA",
            subtype: "Matte",
            colorName: "Ash Gray",
            rgba: "858585FF",
            remainPercent: 68,
            spoolId: "7",
          },
          { id: 2, state: "empty" },
          { id: 3, state: "untagged" },
        ],
      },
      {
        id: 128,
        label: "AMS HT A",
        trays: [{ id: 0, state: "empty" }],
      },
    ],
  })
  expect(
    builtinContractSchemas["spools.v1"].safeParse({
      ...initialSpoolReaderState(),
      spools: [],
      printers: [printer],
    }).success,
  ).toBe(true)
})
test("a Bambuddy spool becomes the contract's spool with remaining weight computed and its slot named", () => {
  const spool = normalizeBambuddySpool({
    data: {
      id: 7,
      brand: "Bambu Lab",
      material: "PLA",
      subtype: "Basic",
      color_name: "Jade White",
      rgba: "FFFFFFFF",
      extra_colors: "ff0000,00ff0080,zz",
      effect_type: "gradient",
      label_weight: 1000,
      core_weight: 250,
      weight_used: 320.5,
      last_scale_weight: 929,
      last_weighed_at: "2026-09-27T12:00:00Z",
      tag_uid: "0123456789ABCDEF",
      tray_uuid: "0123456789ABCDEF0123456789ABCDEF",
      tag_type: "bambu",
    },
    assignments,
  })
  expect(spool).toEqual({
    id: "7",
    brand: "Bambu Lab",
    material: "PLA",
    subtype: "Basic",
    colorName: "Jade White",
    rgba: "FFFFFFFF",
    extraColors: ["ff0000", "00ff0080"],
    effectType: "gradient",
    labelWeightGrams: 1000,
    coreWeightGrams: 250,
    remainingGrams: 679.5,
    lastScaleGrams: 929,
    lastWeighedAtMs: Date.parse("2026-09-27T12:00:00Z"),
    tagUid: "0123456789ABCDEF",
    trayUuid: "0123456789ABCDEF0123456789ABCDEF",
    tagType: "bambu",
    location: {
      printerId: "2",
      printerName: "Printer",
      amsId: 0,
      trayId: 1,
    },
  })
  expect(
    normalizeBambuddySpool({
      data: {
        id: 9,
        material: "ABS",
        label_weight: 500,
        weight_used: 900,
      },
    })?.remainingGrams,
  ).toBe(0)
  expect(
    normalizeBambuddySpool({ data: { id: 9 } }),
  ).toBeUndefined()
})
test("reader events set the scale, match and clear the tag, and ignore other broadcasts", () => {
  const initial = initialSpoolReaderState()
  const weighed = reduceSpoolReaderEvent({
    state: initial,
    event: {
      type: "spoolbuddy_weight",
      device_id: "sb",
      weight_grams: 929.4,
      stable: true,
      raw_adc: 1,
    },
    nowMs: 1000,
  })
  expect(weighed.scale).toEqual({
    grams: 929.4,
    isStable: true,
    isOnline: true,
    updatedAtMs: 1000,
  })
  const matched = reduceSpoolReaderEvent({
    state: weighed,
    event: {
      type: "spoolbuddy_tag_matched",
      tag_uid: "ABCD",
      tray_uuid: "0123",
      spool: { id: 7, material: "PLA" },
    },
    nowMs: 2000,
  })
  expect(matched.tag).toEqual({
    state: "matched",
    uid: "ABCD",
    trayUuid: "0123",
    spoolId: "7",
    updatedAtMs: 2000,
  })
  const unknown = reduceSpoolReaderEvent({
    state: matched,
    event: {
      type: "spoolbuddy_unknown_tag",
      tag_uid: "EF01",
      tray_uuid: null,
      tag_type: "ntag215",
    },
    nowMs: 3000,
  })
  expect(unknown.tag).toEqual({
    state: "unknown",
    uid: "EF01",
    tagType: "ntag215",
    updatedAtMs: 3000,
  })
  const removed = reduceSpoolReaderEvent({
    state: unknown,
    event: {
      type: "spoolbuddy_tag_removed",
      tag_uid: "EF01",
    },
    nowMs: 4000,
  })
  expect(removed.tag).toEqual({
    state: "none",
    updatedAtMs: 4000,
  })
  expect(removed.scale.isOnline).toBe(true)
  const offline = reduceSpoolReaderEvent({
    state: removed,
    event: { type: "spoolbuddy_offline", device_id: "sb" },
    nowMs: 5000,
  })
  expect(offline.scale.isOnline).toBe(false)
  expect(offline.scale.grams).toBe(929.4)
  expect(
    reduceSpoolReaderEvent({
      state: offline,
      event: { type: "printer_status", printer_id: 2 },
    }),
  ).toBe(offline)
})
/** Fake timers do not flush a resolved fetch, so drain the microtask queue. */
const flushMicrotasks = () =>
  Array.from({ length: 20 }).reduce<Promise<void>>(
    (chain) => chain.then(() => Promise.resolve()),
    Promise.resolve(),
  )

test("the event stream fetches a token, parses frames, and reconnects after a close", async () => {
  vi.useFakeTimers()
  const fetchRequest = vi
    .fn<typeof fetch>()
    .mockImplementation(
      async () =>
        new Response(JSON.stringify({ token: "ws-token" })),
    )
  const sockets: {
    url: string
    listeners: Map<
      string,
      (event: { data?: unknown }) => void
    >
    close: ReturnType<typeof vi.fn>
  }[] = []
  const createSocket = (url: string): EventSocket => {
    const listeners = new Map<
      string,
      (event: { data?: unknown }) => void
    >()
    const socket = { url, listeners, close: vi.fn() }
    sockets.push(socket)
    return {
      addEventListener: (type, listener) => {
        listeners.set(type, listener)
      },
      close: socket.close,
    }
  }
  const onEvent = vi.fn()
  const onDisconnect = vi.fn()
  const stream = createBambuddyEventStream({
    context: sourceContext({ fetch: fetchRequest }),
    headers: { "X-API-Key": "test-key" },
    onEvent,
    onDisconnect,
    createSocket,
    initialBackoffMs: 100,
  })
  stream.start()
  await flushMicrotasks()
  expect(sockets).toHaveLength(1)
  expect(fetchRequest.mock.calls[0]?.[0]).toBe(
    "https://service.example/api/v1/auth/ws-token",
  )
  expect(sockets[0]?.url).toBe(
    "wss://service.example/api/v1/ws?token=ws-token",
  )
  sockets[0]?.listeners.get("open")?.({})
  sockets[0]?.listeners.get("message")?.({
    data: JSON.stringify({
      type: "spoolbuddy_weight",
      weight_grams: 1,
    }),
  })
  sockets[0]?.listeners.get("message")?.({
    data: "not json",
  })
  expect(onEvent).toHaveBeenCalledTimes(1)
  expect(onEvent).toHaveBeenCalledWith({
    type: "spoolbuddy_weight",
    weight_grams: 1,
  })
  sockets[0]?.listeners.get("close")?.({})
  sockets[0]?.listeners.get("error")?.({})
  expect(onDisconnect).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(100)
  await flushMicrotasks()
  expect(sockets).toHaveLength(2)
  stream.dispose()
  expect(sockets[1]?.close).toHaveBeenCalled()
  sockets[1]?.listeners.get("close")?.({})
  await vi.advanceTimersByTimeAsync(1000)
  expect(sockets).toHaveLength(2)
  vi.useRealTimers()
})
