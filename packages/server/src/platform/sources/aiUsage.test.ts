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
    periodHours: 5,
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
    periodHours: 720,
    usedText: "$18.6 / $20",
  })
})

test("AI Usage reads each window's span off the words the producer already uses", () => {
  /*
   * The span cannot be recovered from `resets_at`, which is the next clearing
   * time and not the length of the window. It has to come from the naming,
   * and the producer names the same span several different ways across
   * providers.
   */
  const snapshot = normalizeAiUsage({
    providers: [
      {
        provider: "mixed",
        windows: [
          { id: "session_5h", label: "5-hour session" },
          {
            id: "weekly_all",
            label: "Weekly (all models)",
          },
          { id: "primary", label: "Weekly" },
          { id: "rolling", label: "7-day limit" },
          { id: "cap", label: "Monthly allowance" },
          { id: "today", label: "Daily cap" },
          { id: "plan", label: "Included usage" },
        ],
      },
    ],
  })
  expect(
    snapshot.providers[0]?.windows.map(
      (usageWindow) => usageWindow.periodHours,
    ),
  ).toStrictEqual([
    5,
    168,
    168,
    168,
    720,
    24,
    /*
     * "Included usage" resets on a billing date, which is neither a week nor
     * reliably a month. An unclassified window is better than a guessed one:
     * a wrong number here silently promotes it over a real weekly limit.
     */
    undefined,
  ])
})

test("AI Usage prefers a span the producer states outright", () => {
  const snapshot = normalizeAiUsage({
    providers: [
      {
        provider: "explicit",
        windows: [
          {
            id: "odd",
            label: "Billing period",
            period_hours: 336,
          },
        ],
      },
    ],
  })
  expect(
    snapshot.providers[0]?.windows[0]?.periodHours,
  ).toBe(336)
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
