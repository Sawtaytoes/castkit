import { expect, test, vi } from "vitest"
import { sourceContext } from "./__fixtures__/sourceContext.ts"
import {
  createAiUsageSource,
  normalizeAiUsage,
} from "./aiUsage.ts"

const document = {
  fetched_at: "2026-01-01T12:00:00Z",
  poll_interval_sec: 300,
  is_mock: false,
  providers: [
    {
      provider: "claude",
      is_ok: true,
      plan: "Max",
      fetched_at: "2026-01-01T12:00:00Z",
      windows: [
        {
          id: "session_5h",
          label: "5-hour limit",
          percent_used: 7,
          resets_at: "2026-01-01T15:00:00Z",
        },
        {
          id: "weekly_all",
          label: "7-day limit",
          percent_used: 54,
          resets_at: null,
        },
      ],
    },
    {
      provider: "codex_2",
      is_ok: false,
      error: "Sign-in expired",
      fetched_at: "2026-01-01T12:00:00Z",
      windows: [
        {
          id: "primary",
          label: "Monthly limit",
          percent_used: null,
          resets_at: "not-a-date",
          extras: {
            used: 18.6,
            limit: 20,
            unit: "usd",
          },
        },
      ],
    },
  ],
}

test("AI Usage normalizes provider titles, percentages and reset times", () => {
  const snapshot = normalizeAiUsage(document)
  expect(snapshot.fetchedAtMs).toBe(
    Date.parse("2026-01-01T12:00:00Z"),
  )
  expect(snapshot.providers[0]).toMatchObject({
    id: "claude",
    name: "Claude",
    isOk: true,
    planText: "Max",
  })
  expect(snapshot.providers[0]?.windows[0]).toEqual({
    id: "session_5h",
    label: "5-hour limit",
    percentUsed: 7,
    resetsAtMs: Date.parse("2026-01-01T15:00:00Z"),
  })
  /* A window with no reset time carries no key at all, never a zero. */
  expect(
    snapshot.providers[0]?.windows[1]?.resetsAtMs,
  ).toBeUndefined()
  expect(snapshot.providers[1]).toMatchObject({
    id: "codex_2",
    name: "Codex 2",
    isOk: false,
    problemText: "Sign-in expired",
  })
})

test("AI Usage keeps a failed provider and its unmeasured window", () => {
  const snapshot = normalizeAiUsage(document)
  /*
   * Dropping an unreachable provider makes an outage look identical to a
   * healthy display, so the row stays and says why it is empty.
   */
  expect(snapshot.providers).toHaveLength(2)
  expect(snapshot.providers[1]?.windows[0]).toEqual({
    id: "primary",
    label: "Monthly limit",
    usedText: "$18.6 / $20",
  })
})

test("AI Usage refuses a payload that carries no providers", () => {
  expect(() =>
    normalizeAiUsage({ fetched_at: "now" }),
  ).toThrow("providers")
})

test("AI Usage reads the snapshot API and honours a channel's provider filter", async () => {
  const fetchRequest = vi
    .fn<typeof fetch>()
    .mockImplementation(
      async () => new Response(JSON.stringify(document)),
    )
  const context = sourceContext({
    fetch: fetchRequest,
    channels: [
      {
        id: "channel",
        name: "Channel",
        sourceId: "source",
        type: "ai-usage.v1",
        settings: { providerIds: ["claude"] },
      },
    ],
  })
  const adapter = createAiUsageSource(context)
  await adapter.start?.()
  expect(fetchRequest.mock.calls[0]?.[0]).toBe(
    "https://service.example/api/state",
  )
  expect(context.publish).toHaveBeenCalledWith({
    channelId: "channel",
    data: expect.objectContaining({
      providers: [
        expect.objectContaining({ id: "claude" }),
      ],
    }),
  })
  adapter.dispose()
})
