import { expect, test, vi } from "vitest"
import { sourceContext } from "./__fixtures__/sourceContext.ts"
import {
  createAiUsageSource,
  normalizeAiUsage,
} from "./aiUsage.ts"

const claudeMark = {
  view_box: "0 0 16 16",
  paths: [{ d: "M7 14L8 2Z" }],
}
const brand = (title: string) => ({
  title,
  color: "#123456",
  mark: claudeMark,
})

const document = {
  fetched_at: "2026-01-01T12:00:00Z",
  poll_interval_sec: 300,
  is_mock: false,
  providers: [
    {
      provider: "claude",
      brand: brand("Claude"),
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
      brand: { title: "Codex Alt" },
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
    mark: {
      viewBox: "0 0 16 16",
      paths: [{ d: "M7 14L8 2Z" }],
    },
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
    name: "Codex Alt",
    isOk: false,
    problemText: "Sign-in expired",
  })
})

test("AI Usage names both Codex accounts without changing their stable ids", () => {
  const snapshot = normalizeAiUsage({
    providers: [
      {
        provider: "codex",
        brand: brand("Codex"),
        windows: [],
      },
      {
        provider: "codex_2",
        brand: brand("Codex Alt"),
        windows: [],
      },
    ],
  })
  expect(
    snapshot.providers.map(({ id, name }) => ({
      id,
      name,
    })),
  ).toEqual([
    { id: "codex", name: "Codex" },
    { id: "codex_2", name: "Codex Alt" },
  ])
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

test("Codex retains credit balance and available usage-limit resets", () => {
  const snapshot = normalizeAiUsage({
    providers: [
      {
        provider: "codex",
        windows: [
          {
            id: "credits",
            label: "Credits",
            extras: {
              balance: 1234.5,
              unlimited: false,
              overage_limit_reached: false,
            },
          },
          {
            id: "usage_limit_resets",
            label: "Usage limit resets",
            extras: { available_count: 2 },
          },
          {
            id: "zero",
            label: "Usage limit resets",
            extras: { available_count: 0 },
          },
          {
            id: "unlimited",
            label: "Credits",
            extras: { balance: 0, unlimited: true },
          },
          {
            id: "overage",
            label: "Credits",
            extras: {
              balance: 0,
              overage_limit_reached: true,
            },
          },
          {
            id: "invalid",
            label: "Credits",
            extras: {
              balance: "secret",
              available_count: -1,
            },
          },
        ],
      },
    ],
  })
  expect(
    snapshot.providers[0]?.windows.map(
      (window) => window.usedText,
    ),
  ).toEqual([
    "1,234.5 credits",
    "2 available",
    "0 available",
    "Unlimited credits",
    "0 credits · Overage limit reached",
    undefined,
  ])
})

test("AI Usage includes producer account labels without changing ids", () => {
  const snapshot = normalizeAiUsage({
    providers: [
      {
        provider: "claude_2",
        brand: brand("Claude"),
        owner: "Business",
        windows: [],
      },
      {
        provider: "codex_2",
        brand: brand("Codex Alt"),
        owner: "Secondary",
        windows: [],
      },
      {
        provider: "grok",
        brand: brand("SpaceXAI"),
        windows: [],
      },
    ],
  })
  expect(
    snapshot.providers.map(({ id, name }) => ({
      id,
      name,
    })),
  ).toEqual([
    { id: "claude_2", name: "Claude Business" },
    { id: "codex_2", name: "Codex Alt Secondary" },
    { id: "grok", name: "SpaceXAI" },
  ])
})

test("AI Usage titles a third Claude account Claude and carries its owner", () => {
  /*
   * The producer numbers a provider's extra accounts. Its brand titles every
   * seat with the product. A producer that sends no brand still must not turn
   * a third Claude account into "Claude 3", which names a model rather than
   * a subscription.
   */
  const snapshot = normalizeAiUsage({
    providers: [
      {
        provider: "claude",
        brand: brand("Claude"),
        owner: "Personal",
        windows: [],
      },
      {
        provider: "claude_3",
        brand: brand("Claude"),
        owner: "Family",
        windows: [],
      },
    ],
  })
  expect(
    snapshot.providers.map(({ id, name }) => ({
      id,
      name,
    })),
  ).toEqual([
    { id: "claude", name: "Claude Personal" },
    { id: "claude_3", name: "Claude Family" },
  ])
  expect(
    normalizeAiUsage({
      providers: [
        { provider: "claude_3", windows: [] },
        { provider: "codex_2", windows: [] },
        { provider: "open-code", windows: [] },
      ],
    }).providers.map(({ name }) => name),
  ).toEqual(["Claude", "Codex", "Open Code"])
})

test("AI Usage carries the producer's mark, so CastKit keeps no logos of its own", () => {
  const snapshot = normalizeAiUsage({
    providers: [
      {
        provider: "gemini",
        brand: {
          title: "Gemini",
          mark: {
            view_box: "0 0 24 24",
            paths: [{ d: "M12 0L24 12Z" }],
          },
        },
        windows: [],
      },
      {
        provider: "cursor",
        brand: {
          title: "Cursor",
          mark: {
            view_box: "0 0 24 24",
            paths: [
              { d: "M12 2.5 20.5 7" },
              { d: "M12 12V2.5" },
            ],
            stroke_width: 1.6,
          },
        },
        windows: [],
      },
      {
        provider: "opencode",
        brand: {
          title: "OpenCode",
          mark: {
            view_box: "0 0 16 20",
            paths: [
              { d: "M12 16H4V8H12V16Z", opacity: 0.45 },
              { d: "M12 4H4V16H12V4Z" },
            ],
          },
        },
        windows: [],
      },
      { provider: "pi", windows: [] },
    ],
  })
  expect(
    snapshot.providers.map(({ name, mark }) => ({
      name,
      mark,
    })),
  ).toEqual([
    {
      name: "Gemini",
      mark: {
        viewBox: "0 0 24 24",
        paths: [{ d: "M12 0L24 12Z" }],
      },
    },
    {
      name: "Cursor",
      mark: {
        viewBox: "0 0 24 24",
        paths: [
          { d: "M12 2.5 20.5 7" },
          { d: "M12 12V2.5" },
        ],
        strokeWidth: 1.6,
      },
    },
    {
      name: "OpenCode",
      mark: {
        viewBox: "0 0 16 20",
        paths: [
          { d: "M12 16H4V8H12V16Z", opacity: 0.45 },
          { d: "M12 4H4V16H12V4Z" },
        ],
      },
    },
    { name: "Pi", mark: undefined },
  ])
})

test("AI Usage drops a mark that does not fit the contract and keeps the usage", () => {
  const snapshot = normalizeAiUsage({
    providers: [
      {
        provider: "claude",
        brand: {
          title: "Claude",
          mark: {
            view_box: "0 0 16",
            paths: [{ d: "M1 1Z" }],
          },
        },
        windows: [
          {
            id: "weekly",
            label: "Weekly",
            percent_used: 40,
          },
        ],
      },
      {
        provider: "codex",
        brand: {
          title: "Codex",
          mark: { view_box: "0 0 16 16", paths: [] },
        },
        windows: [],
      },
      {
        provider: "grok",
        brand: {
          title: "SpaceXAI",
          mark: {
            view_box: "0 0 16 16",
            paths: [{ d: "M1 1Z", opacity: 2 }],
          },
        },
        windows: [],
      },
    ],
  })
  expect(
    snapshot.providers.map(({ mark }) => mark),
  ).toEqual([undefined, undefined, undefined])
  expect(snapshot.providers[0]).toMatchObject({
    name: "Claude",
    windows: [{ id: "weekly", percentUsed: 40 }],
  })
})
