import { expect, test, vi } from "vitest"
import { sourceContext } from "./__fixtures__/sourceContext.ts"
import {
  createRipDeckSource,
  normalizeRipDeck,
} from "./ripDeck.ts"

const document = {
  hosts: [
    {
      rips: [
        {
          drive_id: "drive-one",
          poster: "/poster/one.jpg",
          start: "2026-01-01T10:00:00Z",
        },
      ],
    },
  ],
  ripDeck: {
    is_tower_present: true,
    active_count: 1,
    bays: [
      {
        drive_id: "drive-one",
        label: "Bay 1",
        is_present: true,
        disc_size_sectors: 500,
        state: {
          state: "ripping",
          title: "Example Film",
          progress_percent: 40,
          eta_seconds: 120,
        },
        actions: ["cancel"],
      },
      {
        drive_id: "drive-two",
        label: "Bay 2",
        is_present: false,
        disc_size_sectors: 100,
        state: {
          state: "idle",
          disc_name: "Finished Disc",
          has_disc: true,
        },
        actions: [],
      },
    ],
    alerts: [],
    loaded_discs: { count: 2 },
  },
}
test("Rip Deck preserves loaded idle bays, progress, art and declared actions", () => {
  const snapshot = normalizeRipDeck(document)
  expect(snapshot.bays[0]).toMatchObject({
    id: "drive-one",
    title: "Example Film",
    percent: 40,
    remainingSeconds: 120,
    posterUrl: "/poster/one.jpg",
    actions: ["cancel"],
  })
  expect(snapshot.bays[1]).toMatchObject({
    hasDisc: true,
    isPresent: false,
    title: "Finished Disc",
  })
  expect(snapshot.loadedDiscCount).toBe(2)
})
test("Rip Deck actions retain backend drive guards and refuse undisplayed actions", async () => {
  const fetchRequest = vi
    .fn<typeof fetch>()
    .mockImplementation(
      async (_url, options) =>
        new Response(
          JSON.stringify(
            options?.method === "POST"
              ? { ok: true }
              : document,
          ),
        ),
    )
  const context = sourceContext({ fetch: fetchRequest })
  const adapter = createRipDeckSource(context)
  await adapter.start?.()
  await expect(
    adapter.executeAction?.({
      channelId: "channel",
      action: "open_bay",
      payload: { driveId: "drive-one" },
    }),
  ).rejects.toThrow("does not offer")
  await adapter.executeAction?.({
    channelId: "channel",
    action: "cancel",
    payload: { driveId: "drive-one" },
  })
  expect(fetchRequest.mock.calls[1]?.[0]).toBe(
    "https://service.example/api/bay-action",
  )
  expect(
    JSON.parse(
      String(fetchRequest.mock.calls[1]?.[1]?.body),
    ),
  ).toEqual({ drive_id: "drive-one", action: "cancel" })
  adapter.dispose()
})

test("Rip Deck retains tray and disc-removed eligibility from its kiosk", async () => {
  const completed = {
    ...document,
    ripDeck: {
      ...document.ripDeck,
      bays: [
        {
          ...document.ripDeck.bays[0],
          actions: [],
          state: { state: "completed" },
        },
      ],
    },
  }
  expect(
    normalizeRipDeck(completed).bays[0]?.actions,
  ).toEqual(["open_bay", "clear_loaded"])
  const active = {
    ...completed,
    ripDeck: {
      ...completed.ripDeck,
      bays: [
        {
          ...completed.ripDeck.bays[0],
          state: { state: "stalled" },
        },
      ],
    },
  }
  expect(normalizeRipDeck(active).bays[0]?.actions).toEqual(
    [],
  )
  const fake = {
    ...completed,
    ripDeck: { ...completed.ripDeck, is_fake: true },
  }
  expect(normalizeRipDeck(fake).bays[0]?.actions).toEqual(
    [],
  )
  const fetchRequest = vi
    .fn<typeof fetch>()
    .mockImplementation(
      async (_url, options) =>
        new Response(
          JSON.stringify(
            options?.method === "POST"
              ? {
                  is_accepted: true,
                  bays: [
                    {
                      drive_id: "drive-one",
                      result: "cleared",
                    },
                  ],
                }
              : completed,
          ),
        ),
    )
  const adapter = createRipDeckSource(
    sourceContext({ fetch: fetchRequest }),
  )
  await adapter.start?.()
  await adapter.executeAction?.({
    channelId: "channel",
    action: "clear_loaded",
    payload: { driveId: "drive-one" },
  })
  expect(fetchRequest.mock.calls[1]?.[0]).toBe(
    "https://service.example/api/tray",
  )
  expect(
    JSON.parse(
      String(fetchRequest.mock.calls[1]?.[1]?.body),
    ),
  ).toEqual({
    command: "clear_loaded",
    drive_id: "drive-one",
  })
  adapter.dispose()
})
test("Rip Deck preserves the targeted tray refusal", async () => {
  const completed = {
    ...document,
    ripDeck: {
      ...document.ripDeck,
      bays: [
        {
          ...document.ripDeck.bays[0],
          actions: [],
          state: { state: "completed" },
        },
      ],
    },
  }
  const fetchRequest = vi
    .fn<typeof fetch>()
    .mockImplementation(
      async (_url, options) =>
        new Response(
          JSON.stringify(
            options?.method === "POST"
              ? {
                  is_accepted: true,
                  bays: [
                    {
                      drive_id: "drive-one",
                      result: "refused_ripping",
                      detail: "This bay is ripping.",
                    },
                  ],
                }
              : completed,
          ),
        ),
    )
  const adapter = createRipDeckSource(
    sourceContext({ fetch: fetchRequest }),
  )
  await adapter.start?.()
  await expect(
    adapter.executeAction?.({
      channelId: "channel",
      action: "open_bay",
      payload: { driveId: "drive-one" },
    }),
  ).rejects.toThrow("This bay is ripping.")
  adapter.dispose()
})

test("Rip Deck binds poster and touch identity to the current job", () => {
  const current = {
    ...document,
    ripDeck: {
      ...document.ripDeck,
      bays: [
        {
          ...document.ripDeck.bays[0],
          state: {
            ...document.ripDeck.bays[0]?.state,
            job_id: "new-job",
          },
        },
      ],
    },
  }
  expect(normalizeRipDeck(current).bays[0]).toMatchObject({
    jobId: "new-job",
  })
  expect(
    normalizeRipDeck(current).bays[0]?.posterUrl,
  ).toBeUndefined()
})
