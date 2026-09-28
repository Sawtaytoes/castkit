import { expect, test, vi } from "vitest"
import { sourceContext } from "./__fixtures__/sourceContext.ts"
import {
  createBambuddySource,
  normalizeBambuddyPrinter,
} from "./bambuddy.ts"

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
    "https://service.example/api/v1/printers/2/cover?token=fixture-token",
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
const spoolsAdapter = () => {
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
        type: "spools.v1",
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
              { id: 1, state: "untagged", spoolId: "7" },
            ],
          },
        ],
      },
    ],
  })
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
