import type { ContractData } from "@castkit/sdk/contracts"
import { expect, test, vi } from "vitest"
import { sourceContext } from "./__fixtures__/sourceContext.ts"
import {
  createBambuddySource,
  normalizeBambuddyPrinter,
} from "./bambuddy.ts"

test("Bambuddy printer normalization names the filament in the active tray and the nozzle", () => {
  const normalized = normalizeBambuddyPrinter({
    channelId: "printers",
    data: {
      id: 3,
      name: "Printer",
      connected: true,
      state: "RUNNING",
      progress: 10,
      tray_now: 6,
      ams: [
        { id: 0, tray: [{ id: 0, tray_type: "PLA" }] },
        {
          id: 1,
          tray: [
            { id: 1, tray_type: "PETG" },
            {
              id: 2,
              tray_type: "PLA",
              tray_sub_brands: "PLA Matte",
              tray_color: "A03B3BFF",
            },
          ],
        },
      ],
      nozzles: [
        {
          nozzle_type: "hardened_steel",
          nozzle_diameter: "0.4",
        },
      ],
    },
  })
  expect(normalized).toMatchObject({
    filamentText: "PLA Matte · AMS 2 slot 3",
    filamentColor: "#A03B3B",
    nozzleText: "0.4 mm hardened steel",
  })
  expect(
    normalizeBambuddyPrinter({
      channelId: "printers",
      data: {
        id: 3,
        connected: true,
        state: "RUNNING",
        tray_now: 254,
        vt_tray: [{ id: 254, tray_type: "TPU" }],
      },
    }),
  ).toMatchObject({ filamentText: "TPU · External spool" })
  const none = normalizeBambuddyPrinter({
    channelId: "printers",
    data: {
      id: 3,
      connected: true,
      state: "RUNNING",
      tray_now: 255,
    },
  })
  expect(none?.filamentText).toBeUndefined()
  expect(none?.nozzleText).toBeUndefined()
})

test("Bambuddy printer normalization drops an ordering prefix from the printer's name", () => {
  const printer = normalizeBambuddyPrinter({
    channelId: "printers",
    data: {
      id: 2,
      name: "2 - Foopie",
      connected: true,
      state: "RUNNING",
      progress: 3,
    },
  })
  expect(printer?.name).toBe("Foopie")
})

test("Bambuddy printer normalization lists the archive's filament slots when the live mapping is empty", () => {
  const printer = normalizeBambuddyPrinter({
    channelId: "printers",
    data: {
      id: 3,
      name: "Printer",
      connected: true,
      state: "RUNNING",
      progress: 12,
      ams: [{ id: 0, tray: [] }],
      ams_mapping: [],
      tray_now: 10,
      archive_filament_slots: [
        {
          slot_id: 1,
          used_g: 4.03,
          type: "PLA",
          color: "#000000",
        },
        {
          slot_id: 2,
          used_g: 12,
          type: "PLA",
          color: "#5FA35D",
        },
      ],
    },
  })
  expect(printer?.filaments).toEqual([
    {
      name: "PLA",
      color: "#000000",
      location: "Filament 1 · 4.0 g",
    },
    {
      name: "PLA",
      color: "#5fa35d",
      location: "Filament 2 · 12 g",
    },
  ])
})

test("Bambuddy printer normalization joins archive filaments to uniquely matching AMS trays", () => {
  const printer = normalizeBambuddyPrinter({
    channelId: "printers",
    data: {
      id: 3,
      name: "Printer",
      connected: true,
      state: "RUNNING",
      progress: 12,
      ams_mapping: [],
      tray_now: 11,
      ams: [
        {
          id: 2,
          tray: [
            {
              id: 0,
              tray_type: "PLA",
              tray_sub_brands: "PLA Basic",
              tray_color: "000000FF",
            },
            {
              id: 3,
              tray_type: "PLA",
              tray_sub_brands: "PLA Basic",
              tray_color: "3F8E43FF",
            },
          ],
        },
      ],
      archive_filament_slots: [
        {
          slot_id: 1,
          used_g: 77,
          type: "PLA",
          color: "#000000",
        },
        {
          slot_id: 2,
          used_g: 38,
          type: "PLA",
          color: "#3F8E43",
        },
      ],
    },
  })

  expect(printer?.filamentText).toBe(
    "PLA Basic · AMS 3 slot 4",
  )
  expect(printer?.filaments).toEqual([
    {
      name: "PLA Basic",
      color: "#000000",
      rgba: "000000FF",
      location: "AMS 3, slot 1 · Filament 1 · 77 g",
    },
    {
      name: "PLA Basic",
      color: "#3f8e43",
      rgba: "3F8E43FF",
      location: "AMS 3, slot 4 · Filament 2 · 38 g",
    },
  ])
})

test("Bambuddy printer normalization keeps an archive slot when live AMS matches are ambiguous", () => {
  const printer = normalizeBambuddyPrinter({
    channelId: "printers",
    data: {
      id: 3,
      name: "Printer",
      connected: true,
      state: "RUNNING",
      progress: 12,
      ams_mapping: [],
      tray_now: 1,
      ams: [
        {
          id: 0,
          tray: [
            {
              id: 0,
              tray_type: "PLA",
              tray_sub_brands: "PLA Basic",
              tray_color: "000000FF",
            },
            {
              id: 1,
              tray_type: "PLA",
              tray_sub_brands: "PLA Matte",
              tray_color: "000000FF",
            },
          ],
        },
      ],
      archive_filament_slots: [
        {
          slot_id: 1,
          used_g: 77,
          type: "PLA",
          color: "#000000",
        },
      ],
    },
  })

  expect(printer?.filaments).toEqual([
    {
      name: "PLA",
      color: "#000000",
      location: "Filament 1 · 77 g",
    },
  ])
})

test("Bambuddy printer normalization names each archive slot's color from the loaded spool", () => {
  const printer = normalizeBambuddyPrinter({
    channelId: "printers",
    spools: [
      {
        id: 10,
        material: "PLA",
        subtype: "Basic",
        color_name: "Mistletoe Green",
        rgba: "3F8E43FF",
      },
      {
        id: 11,
        material: "PLA",
        subtype: "Matte",
        color_name: "Charcoal",
        rgba: "000000FF",
      },
      {
        id: 12,
        material: "PLA",
        subtype: "Basic",
        color_name: "Black",
        rgba: "000000FF",
      },
      {
        id: 13,
        material: "PETG",
        subtype: "HF",
        color_name: "Red",
        rgba: "E94B3CFF",
      },
    ],
    assignments: [
      {
        spoolId: "10",
        printerId: "3",
        printerName: "Printer",
        amsId: 2,
        trayId: 3,
      },
      {
        spoolId: "11",
        printerId: "3",
        printerName: "Printer",
        amsId: 1,
        trayId: 2,
      },
      {
        spoolId: "12",
        printerId: "3",
        printerName: "Printer",
        amsId: 1,
        trayId: 3,
      },
      // Loaded in a different printer, so it names nothing here.
      {
        spoolId: "13",
        printerId: "4",
        printerName: "Other",
        amsId: 0,
        trayId: 0,
      },
    ],
    data: {
      id: 3,
      name: "Printer",
      connected: true,
      state: "RUNNING",
      progress: 12,
      ams: [{ id: 0, tray: [] }],
      ams_mapping: [],
      archive_filament_slots: [
        {
          slot_id: 1,
          used_g: 21.31,
          type: "PLA",
          color: "#3F8E43",
        },
        {
          slot_id: 2,
          used_g: 0.68,
          type: "PLA",
          color: "#000000",
        },
        {
          slot_id: 3,
          used_g: 1,
          type: "PLA",
          color: "#E94B3C",
        },
      ],
    },
  })
  expect(printer?.filaments).toEqual([
    {
      name: "PLA Basic",
      color: "#3f8e43",
      colorName: "Mistletoe Green",
      rgba: "3F8E43FF",
      location: "AMS 3, slot 4 · Filament 1 · 21 g",
    },
    // Two black spools with different names: neither is guessed.
    {
      name: "PLA",
      color: "#000000",
      rgba: "000000FF",
      location: "Filament 2 · 0.7 g",
    },
    {
      name: "PLA",
      color: "#e94b3c",
      location: "Filament 3 · 1.0 g",
    },
  ])
})

test("Bambuddy printer normalization matches the printer contract and ignores idle machines", () => {
  expect(
    normalizeBambuddyPrinter({
      channelId: "printers",
      data: {
        id: 2,
        name: "Printer",
        connected: true,
        state: "PAUSE",
        subtask_name: "Example",
        progress: 42,
        remaining_time: 5,
        cover_url: "/api/v1/printers/2/cover",
      },
    }),
  ).toMatchObject({
    id: "2",
    name: "Printer",
    state: "paused",
    percent: 42,
    remainingMinutes: 5,
    thumbnailPath:
      "/api/platform/channels/printers/media/2?kind=cover",
    cameraPath:
      "/api/platform/channels/printers/media/2?kind=stream",
    cameraIsLive: true,
  })
  expect(
    normalizeBambuddyPrinter({
      channelId: "printers",
      data: { id: 2, connected: true, state: "IDLE" },
    }),
  ).toBeUndefined()
})

test("a printer with a direct camera uses the HLS path", () => {
  expect(
    normalizeBambuddyPrinter({
      channelId: "printers",
      cameraFormat: "hls",
      data: { id: 2, connected: true, state: "RUNNING" },
    }),
  ).toMatchObject({
    cameraPath:
      "/api/platform/channels/printers/media/2?kind=hls",
    cameraFormat: "hls",
  })
})
test("Bambuddy controls and media only address configured printer IDs", async () => {
  const fetchRequest = vi
    .fn<typeof fetch>()
    .mockImplementation(
      async (url) =>
        new Response(
          JSON.stringify(
            String(url).endsWith("/camera/stream-token")
              ? { token: "fixture-token" }
              : String(url).endsWith("/printers/")
                ? [
                    { id: 2, name: "Printer" },
                    { id: 3, name: "Other" },
                  ]
                : {
                    id: 2,
                    connected: true,
                    state: "RUNNING",
                    name: "Printer",
                    progress: 5,
                  },
          ),
        ),
    )
  const context = sourceContext({
    fetch: fetchRequest,
    channels: [
      {
        id: "printers",
        name: "Printers",
        sourceId: "source",
        type: "printers.v1",
        settings: { printerIds: ["2"] },
      },
    ],
  })
  const adapter = createBambuddySource(context)
  await adapter.start?.()
  await expect(
    adapter.executeAction?.({
      channelId: "printers",
      action: "stop",
      payload: { printerId: "3" },
    }),
  ).rejects.toThrow("does not allow")
  await adapter.executeAction?.({
    channelId: "printers",
    action: "pause",
    payload: { printerId: "2" },
  })
  expect(fetchRequest.mock.calls.at(-1)?.[0]).toBe(
    "https://service.example/api/v1/printers/2/print/pause",
  )
  await adapter.getMedia?.({
    channelId: "printers",
    assetId: "2",
    kind: "stream",
  })
  expect(fetchRequest.mock.calls.at(-1)?.[0]).toBe(
    "https://service.example/api/v1/printers/2/camera/stream?token=fixture-token",
  )
  await adapter.getMedia?.({
    channelId: "printers",
    assetId: "2",
    kind: "camera",
  })
  expect(fetchRequest.mock.calls.at(-1)?.[0]).toBe(
    "https://service.example/api/v1/printers/2/camera/snapshot?token=fixture-token",
  )
  await adapter.getMedia?.({
    channelId: "printers",
    assetId: "2",
    kind: "cover",
  })
  expect(fetchRequest.mock.calls.at(-1)?.[0]).toBe(
    "https://service.example/api/v1/printers/2/cover",
  )
  adapter.dispose()
})

const spoolsFixture = {
  spools: [
    {
      id: 7,
      brand: "Bambu Lab",
      material: "PLA",
      subtype: "Basic",
      color_name: "Jade White",
      rgba: "FFFFFFFF",
      extra_colors: null,
      effect_type: null,
      label_weight: 1000,
      core_weight: 250,
      weight_used: 320,
      last_scale_weight: 929,
      tag_uid: "0123456789ABCDEF",
      note: "keep",
      cost_per_kg: 20,
    },
  ],
  assignments: [
    {
      id: 1,
      spool_id: 7,
      printer_id: 2,
      printer_name: "Printer",
      ams_id: 0,
      tray_id: 1,
    },
  ],
}
const spoolsAdapter = (
  channelType: "spools.v1" | "ams.v1" = "spools.v1",
) => {
  const requests: { url: string; init?: RequestInit }[] = []
  const fetchRequest = vi
    .fn<typeof fetch>()
    .mockImplementation(async (url, init) => {
      requests.push({ url: String(url), init })
      const path = new URL(String(url)).pathname
      return new Response(
        JSON.stringify(
          path.endsWith("/auth/ws-token")
            ? { token: "ws-token" }
            : path.endsWith("/printers/")
              ? [{ id: 2, name: "Printer" }]
              : path.endsWith("/status")
                ? {
                    id: 2,
                    name: "Printer",
                    connected: true,
                    state: "IDLE",
                    ams: [
                      {
                        id: 0,
                        tray: [
                          { id: 0 },
                          { id: 1, tray_type: "PLA" },
                        ],
                      },
                    ],
                  }
                : path.endsWith("/inventory/spools") &&
                    init?.method === "POST"
                  ? { id: 11 }
                  : path.endsWith("/inventory/spools")
                    ? spoolsFixture.spools
                    : path.endsWith(
                          "/inventory/assignments",
                        ) && init?.method === "POST"
                      ? { id: 2 }
                      : path.endsWith(
                            "/inventory/assignments",
                          )
                        ? spoolsFixture.assignments
                        : { status: "ok" },
        ),
      )
    })
  const context = sourceContext({
    fetch: fetchRequest,
    channels: [
      {
        id: "spools",
        name: "Spools",
        sourceId: "source",
        type: channelType,
        settings: {},
      },
    ],
  })
  return {
    requests,
    context,
    adapter: createBambuddySource(context),
  }
}
const requestBody = (request: { init?: RequestInit }) =>
  JSON.parse(String(request.init?.body))

test("Bambuddy publishes a spools snapshot with the inventory joined onto the AMS trays", async () => {
  const { adapter, context } = spoolsAdapter()
  await adapter.start?.()
  const published = vi
    .mocked(context.publish)
    .mock.calls.at(-1)?.[0]
  expect(published?.channelId).toBe("spools")
  expect(published?.data).toMatchObject({
    scale: { grams: 0, isStable: false, isOnline: false },
    tag: { state: "none" },
    spools: [
      {
        id: "7",
        remainingGrams: 680,
        location: {
          printerId: "2",
          printerName: "Printer",
          amsId: 0,
          trayId: 1,
        },
      },
    ],
    printers: [
      {
        id: "2",
        isOnline: true,
        ams: [
          {
            id: 0,
            trays: [
              { id: 0, state: "empty" },
              {
                id: 1,
                state: "read",
                material: "PLA",
                subtype: "Basic",
                colorName: "Jade White",
                rgba: "FFFFFFFF",
                remainPercent: 68,
                spoolId: "7",
              },
            ],
          },
        ],
      },
    ],
  })
  adapter.dispose()
})
test("Bambuddy keeps publishing the printers when the inventory read fails, and only the spools channel reports it", async () => {
  const fetchRequest = vi
    .fn<typeof fetch>()
    .mockImplementation(async (url) => {
      const path = new URL(String(url)).pathname
      if (path.endsWith("/inventory/spools")) {
        return new Response("Internal Server Error", {
          status: 500,
        })
      }
      return new Response(
        JSON.stringify(
          path.endsWith("/auth/ws-token")
            ? { token: "ws-token" }
            : path.endsWith("/printers/")
              ? [{ id: 2, name: "Printer" }]
              : path.endsWith("/status")
                ? {
                    id: 2,
                    name: "Printer",
                    connected: true,
                    state: "RUNNING",
                    progress: 40,
                    current_print: "Desk stand",
                  }
                : path.endsWith("/inventory/assignments")
                  ? []
                  : { status: "ok" },
        ),
      )
    })
  const context = sourceContext({
    fetch: fetchRequest,
    channels: [
      {
        id: "printers",
        name: "Printers",
        sourceId: "source",
        type: "printers.v1",
        settings: {},
      },
      {
        id: "spools",
        name: "Spools",
        sourceId: "source",
        type: "spools.v1",
        settings: {},
      },
    ],
  })
  const adapter = createBambuddySource(context)
  await adapter.start?.()
  const published = vi
    .mocked(context.publish)
    .mock.calls.map((call) => call[0])
  expect(
    published.find((call) => call.channelId === "printers")
      ?.data,
  ).toMatchObject({
    printers: [
      { id: "2", name: "Printer", jobName: "Desk stand" },
    ],
  })
  expect(
    published.some((call) => call.channelId === "spools"),
  ).toBe(false)
  expect(context.reportError).toHaveBeenCalledWith({
    channelId: "spools",
    error: expect.stringContaining("Bambuddy inventory"),
  })
  expect(context.reportError).not.toHaveBeenCalledWith(
    expect.objectContaining({ channelId: "printers" }),
  )
  adapter.dispose()
})
test("Bambuddy spool actions map onto the dashboard's requests and refresh the inventory", async () => {
  const { adapter, requests } = spoolsAdapter()
  await adapter.start?.()
  await expect(
    adapter.executeAction?.({
      channelId: "spools",
      action: "save_weight",
      payload: { spoolId: "99", grams: 900 },
    }),
  ).rejects.toThrow("not in the Bambuddy inventory")
  await expect(
    adapter.executeAction?.({
      channelId: "spools",
      action: "assign_slot",
      payload: {
        spoolId: "7",
        printerId: "2",
        amsId: 0.5,
        trayId: 1,
      },
    }),
  ).rejects.toThrow("AMS id and a tray id")
  await adapter.executeAction?.({
    channelId: "spools",
    action: "save_weight",
    payload: { spoolId: "7", grams: 929.5 },
  })
  const saved = requests.find((request) =>
    request.url.endsWith("/scale/update-spool-weight"),
  )
  expect(saved?.init?.method).toBe("POST")
  expect(requestBody(saved ?? {})).toEqual({
    spool_id: 7,
    weight_grams: 929.5,
  })
  expect(
    requests
      .slice(saved ? requests.indexOf(saved) : 0)
      .map((request) => new URL(request.url).pathname),
  ).toContain("/api/v1/inventory/spools")
  await adapter.executeAction?.({
    channelId: "spools",
    action: "assign_slot",
    payload: {
      spoolId: "7",
      printerId: "2",
      amsId: 0,
      trayId: 3,
    },
  })
  const assigned = requests.find(
    (request) =>
      request.url.endsWith("/inventory/assignments") &&
      request.init?.method === "POST",
  )
  expect(requestBody(assigned ?? {})).toEqual({
    spool_id: 7,
    printer_id: 2,
    ams_id: 0,
    tray_id: 3,
  })
  await adapter.executeAction?.({
    channelId: "spools",
    action: "link_tag",
    payload: {
      spoolId: "7",
      tagUid: "ABCD",
      tagType: "ntag215",
      trayUuid: "0123",
    },
  })
  const linked = requests.find((request) =>
    request.url.endsWith("/inventory/spools/7/link-tag"),
  )
  expect(linked?.init?.method).toBe("PATCH")
  expect(requestBody(linked ?? {})).toEqual({
    tag_uid: "ABCD",
    tray_uuid: "0123",
    tag_type: "ntag215",
  })
  adapter.dispose()
})
test("Bambuddy copy_to_tag creates a spool from the product fields only and links the new tag", async () => {
  const { adapter, requests } = spoolsAdapter()
  await adapter.start?.()
  await adapter.executeAction?.({
    channelId: "spools",
    action: "copy_to_tag",
    payload: { spoolId: "7", tagUid: "EF01" },
  })
  const created = requests.find(
    (request) =>
      request.url.endsWith("/inventory/spools") &&
      request.init?.method === "POST",
  )
  expect(requestBody(created ?? {})).toEqual({
    material: "PLA",
    subtype: "Basic",
    brand: "Bambu Lab",
    color_name: "Jade White",
    rgba: "FFFFFFFF",
    label_weight: 1000,
    core_weight: 250,
  })
  const linked = requests.find((request) =>
    request.url.endsWith("/inventory/spools/11/link-tag"),
  )
  expect(linked?.init?.method).toBe("PATCH")
  expect(requestBody(linked ?? {})).toEqual({
    tag_uid: "EF01",
  })
  adapter.dispose()
})
test("Bambuddy reports a refused spool action by name", async () => {
  const { adapter, context } = spoolsAdapter()
  await adapter.start?.()
  vi.mocked(context.fetch).mockResolvedValue(
    new Response("nope", { status: 409 }),
  )
  await expect(
    adapter.executeAction?.({
      channelId: "spools",
      action: "link_tag",
      payload: { spoolId: "7", tagUid: "ABCD" },
    }),
  ).rejects.toThrow(
    "Bambuddy could not link the tag: The source returned HTTP 409.",
  )
  adapter.dispose()
})

test.each([
  "FINISH",
  "FAILED",
  "IDLE",
])("%s stays visible only until Bambuddy's plate-clear gate drops", (state) => {
  const data = {
    id: 2,
    name: "Printer",
    connected: true,
    state,
    awaiting_plate_clear: true,
    progress: 100,
    remaining_time: 0,
  }
  const normalized = normalizeBambuddyPrinter({
    channelId: "printers",
    data,
  })
  expect(normalized?.state).toBe(
    state === "FAILED" ? "failed" : "finished",
  )
  expect(normalized?.finishAtMs).toBeUndefined()
  expect(normalized?.remainingMinutes).toBeUndefined()
  expect(
    normalizeBambuddyPrinter({
      channelId: "printers",
      data: { ...data, awaiting_plate_clear: false },
    }),
  ).toBeUndefined()
  expect(
    normalizeBambuddyPrinter({
      channelId: "printers",
      data: { ...data, connected: false },
    }),
  ).toBeUndefined()
})

test("plate clearance rechecks live state and only posts to the selected printer's clear endpoint", async () => {
  const status = {
    id: 2,
    connected: true,
    state: "FINISH",
    awaiting_plate_clear: true,
  }
  const fetchRequest = vi.fn<typeof fetch>(
    async (url) =>
      new Response(
        JSON.stringify(
          String(url).endsWith("/printers/")
            ? [{ id: 2, name: "Printer" }]
            : String(url).endsWith("/status")
              ? status
              : { success: true },
        ),
      ),
  )
  const context = sourceContext({
    fetch: fetchRequest,
    channels: [
      {
        id: "printers",
        name: "Printers",
        sourceId: "source",
        type: "printers.v1",
        settings: { printerIds: ["2"] },
      },
    ],
  })
  const adapter = createBambuddySource(context)
  await adapter.start?.()
  await adapter.executeAction?.({
    channelId: "printers",
    action: "clear_plate",
    payload: { printerId: "2" },
  })
  expect(fetchRequest.mock.calls.at(-1)?.[0]).toBe(
    "https://service.example/api/v1/printers/2/clear-plate",
  )
  status.state = "RUNNING"
  await expect(
    adapter.executeAction?.({
      channelId: "printers",
      action: "clear_plate",
      payload: { printerId: "2" },
    }),
  ).rejects.toThrow("not awaiting")
  await expect(
    adapter.executeAction?.({
      channelId: "printers",
      action: "clear_plate",
      payload: { printerId: "3" },
    }),
  ).rejects.toThrow("does not allow")
  adapter.dispose?.()
})

const sparsePrint = {
  id: 9,
  name: "Printer",
  connected: true,
  state: "RUNNING",
  current_archive_id: 42,
  ams_mapping: [],
  ams: [{ id: 0, tray: [{ id: 2 }] }],
  archive_filament_slots: [
    {
      slot_id: 1,
      type: "PLA",
      color: "#000000",
      used_g: 4.1,
    },
    {
      slot_id: 3,
      type: "PLA",
      color: "#FFFFFF",
      used_g: 2.3,
    },
    {
      slot_id: 7,
      type: "PLA",
      color: "#F74E02",
      used_g: 1.8,
    },
  ],
}
const orangeInventory = [
  {
    id: 10,
    material: "PLA",
    subtype: "Translucent",
    color_name: "Orange",
    brand: "Sample Brand",
    rgba: "F74E0280",
  },
]
const printMapping = [7, 8, 0, -1, 4, 5, 2]

test("a queue mapping resolves sparse slicer indices even when live trays have no filament details", () => {
  const printer = normalizeBambuddyPrinter({
    channelId: "printers",
    data: {
      ...sparsePrint,
      print_ams_mapping: printMapping,
    },
    spools: orangeInventory,
  })
  expect(printer?.filaments).toEqual([
    {
      name: "PLA",
      color: "#000000",
      location: "AMS 2, slot 4 · Filament 1 · 4.1 g",
    },
    {
      name: "PLA",
      color: "#ffffff",
      location: "AMS 1, slot 1 · Filament 3 · 2.3 g",
    },
    {
      name: "PLA Translucent",
      color: "#f74e02",
      colorName: "Orange",
      rgba: "F74E0280",
      brand: "Sample Brand",
      location: "AMS 1, slot 3 · Filament 7 · 1.8 g",
    },
  ])
})

test("a mapped physical slot disambiguates products with the same base color", () => {
  const printer = normalizeBambuddyPrinter({
    channelId: "printers",
    data: {
      ...sparsePrint,
      print_ams_mapping: [7],
      archive_filament_slots: [
        sparsePrint.archive_filament_slots[0],
      ],
    },
    spools: [
      {
        id: 1,
        material: "PLA",
        subtype: "Basic",
        rgba: "000000FF",
        color_name: "Black",
      },
      {
        id: 2,
        material: "PLA",
        subtype: "Galaxy",
        rgba: "000000FF",
        color_name: "Starry Black",
        effect_type: "galaxy",
        extra_colors: "112233,445566",
      },
    ],
    assignments: [
      {
        printerId: "9",
        printerName: "Printer",
        spoolId: "1",
        amsId: 0,
        trayId: 1,
      },
      {
        printerId: "9",
        printerName: "Printer",
        spoolId: "2",
        amsId: 1,
        trayId: 3,
      },
    ],
  })
  expect(printer?.filaments?.[0]).toEqual({
    name: "PLA Galaxy",
    color: "#000000",
    colorName: "Starry Black",
    rgba: "000000FF",
    effectType: "galaxy",
    extraColors: ["112233", "445566"],
    location: "AMS 2, slot 4 · Filament 1 · 4.1 g",
  })
})

test("ambiguous inventory appearance does not assign a finish or a physical location", () => {
  const printer = normalizeBambuddyPrinter({
    channelId: "printers",
    data: {
      ...sparsePrint,
      archive_filament_slots: [
        sparsePrint.archive_filament_slots[2],
      ],
    },
    spools: orangeInventory.concat([
      {
        id: 11,
        material: "PLA",
        subtype: "Basic",
        color_name: "Orange",
        brand: "Sample Brand",
        rgba: "F74E02FF",
      },
    ]),
  })
  expect(printer?.filaments?.[0]).toEqual({
    name: "PLA",
    color: "#f74e02",
    colorName: "Orange",
    brand: "Sample Brand",
    location: "Filament 7 · 1.8 g",
  })
})

test.each([
  -1,
  255,
  32,
  1.5,
  "7",
  null,
])("invalid queue tray %s does not invent an AMS location", (trayId) => {
  const printer = normalizeBambuddyPrinter({
    channelId: "printers",
    data: {
      ...sparsePrint,
      print_ams_mapping: [trayId],
      archive_filament_slots: [
        sparsePrint.archive_filament_slots[0],
      ],
    },
  })
  expect(printer?.filaments?.[0]?.location).toBe(
    "Filament 1 · 4.1 g",
  )
})

test.each([
  200, 403,
])("Bambuddy reads the active print's own queue map and preserves the printer when queue returns %s", async (queueStatus) => {
  const context = sourceContext({
    channels: [
      {
        id: "printers",
        name: "Printers",
        sourceId: "source",
        type: "printers.v1",
        settings: {},
      },
    ],
    fetch: vi
      .fn<typeof fetch>()
      .mockImplementation(async (url) => {
        const path = new URL(String(url)).pathname
        if (path.endsWith("/queue/")) {
          return new Response(
            JSON.stringify([
              {
                printer_id: 8,
                archive_id: 42,
                status: "printing",
                ams_mapping: [1, 1, 1],
              },
              {
                printer_id: 9,
                archive_id: 41,
                status: "printing",
                ams_mapping: [1, 1, 1],
              },
              {
                printer_id: 9,
                archive_id: 42,
                status: "completed",
                ams_mapping: [1, 1, 1],
              },
              {
                printer_id: 9,
                archive_id: 42,
                status: "printing",
                ams_mapping: printMapping,
              },
            ]),
            { status: queueStatus },
          )
        }
        const data = path.endsWith("/printers/")
          ? [{ id: 9, name: "Printer" }]
          : path.endsWith("/status")
            ? sparsePrint
            : path.endsWith("/archives/42")
              ? {
                  extra_data: {
                    filament_slots:
                      sparsePrint.archive_filament_slots,
                  },
                }
              : path.endsWith("/inventory/spools")
                ? orangeInventory
                : []
        return new Response(JSON.stringify(data))
      }),
  })
  const adapter = createBambuddySource(context)
  try {
    await adapter.start?.()
    const published = vi
      .mocked(context.publish)
      .mock.calls.at(-1)?.[0]
    const data = published?.data as {
      printers: {
        filaments: { location: string; rgba?: string }[]
      }[]
    }
    expect(data.printers[0]?.filaments[2]).toMatchObject({
      location:
        queueStatus === 200
          ? "AMS 1, slot 3 · Filament 7 · 1.8 g"
          : "Filament 7 · 1.8 g",
      rgba: "F74E0280",
    })
    expect(context.reportError).not.toHaveBeenCalled()
  } finally {
    adapter.dispose()
  }
})

test("an archive mapped to the active external spool keeps its usage without duplicating the spool", () => {
  const printer = normalizeBambuddyPrinter({
    channelId: "printers",
    spools: orangeInventory,
    data: {
      ...sparsePrint,
      tray_now: 254,
      vt_tray: [
        { tray_type: "PLA", tray_color: "F74E0280" },
      ],
      archive_filament_slots: [
        sparsePrint.archive_filament_slots[2],
      ],
      print_ams_mapping: printMapping.map(
        (_trayId, index) => (index === 6 ? 254 : -1),
      ),
    },
  })
  expect(printer?.filaments).toEqual([
    {
      name: "PLA Translucent",
      color: "#f74e02",
      colorName: "Orange",
      brand: "Sample Brand",
      rgba: "F74E0280",
      location: "External spool · Filament 7 · 1.8 g",
    },
  ])
})

test("the public AMS channel publishes only printer facts and refuses writes", async () => {
  const { adapter, context } = spoolsAdapter("ams.v1")
  await adapter.start?.()
  const published = vi
    .mocked(context.publish)
    .mock.calls.at(-1)?.[0].data
  expect(Object.keys(published as object)).toEqual([
    "printers",
  ])
  expect(
    (published as ContractData["ams.v1"]).printers[0]?.ams,
  ).toHaveLength(1)
  await expect(
    adapter.executeAction?.({
      channelId: "spools",
      action: "pause",
      payload: { printerId: "2" },
    }),
  ).rejects.toThrow("read-only")
  await expect(
    adapter.getMedia?.({
      channelId: "spools",
      assetId: "2",
      kind: "camera",
    }),
  ).rejects.toThrow("only provides printer product images")
  adapter.dispose()
})
