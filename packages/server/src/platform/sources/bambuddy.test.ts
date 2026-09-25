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
