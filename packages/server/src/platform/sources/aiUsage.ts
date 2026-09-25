import type { ContractData } from "@castkit/sdk/contracts"
import type { SourceFactory } from "@castkit/sdk/plugin"
import {
  finiteNumber,
  pollingSource,
  record,
  sourceRequest,
  stringList,
  textValue,
} from "./http.ts"

/**
 * Titles the AI Usage producer does not spell out for itself.
 *
 * The producer sends a stable machine id, because its Home Assistant entities
 * and its usage history are keyed on it. A display needs the product name, and
 * capitalising the id gets "Codex 2" right but not "OpenAI" — so the names it
 * cannot derive are listed here and everything else falls back to the id with
 * its first letter raised.
 */
const PROVIDER_TITLES: Record<string, string> = {
  claude: "Claude",
  codex: "Codex",
  codex_2: "Codex 2",
  cursor: "Cursor",
  grok: "Grok",
}

const getProviderTitle = (providerId: string) =>
  PROVIDER_TITLES[providerId] ??
  providerId
    .split(/[_-]/)
    .filter((part) => part.length > 0)
    .map(
      (part) =>
        `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`,
    )
    .join(" ")

const optionalText = (value: unknown) =>
  typeof value === "string" && value ? value : undefined

const parseTimestamp = (value: unknown) => {
  const text = optionalText(value)
  if (!text) {
    return undefined
  }
  const parsed = Date.parse(text)
  return Number.isNaN(parsed) ? undefined : parsed
}

const WEEK_HOURS = 168
const MONTH_HOURS = 720

/**
 * How long a quota window spans, read off the producer's own id and label.
 *
 * The producer does not publish a period, and it cannot be recovered from
 * `resets_at`: that is the next clearing time, not the span. So the span is
 * inferred from the words the producer already uses, in the order most
 * specific first — an explicit count of hours or days beats the named period,
 * because "7-day limit" and "Weekly Fable" must both land on 168 while
 * "5-hour session" must not be dragged there by the word "session".
 *
 * A window that matches nothing keeps no period at all. "Included usage" is
 * real and is deliberately left unclassified: it resets on the billing date,
 * which is neither a week nor reliably a month, and a wrong number here would
 * silently promote it over a weekly limit.
 */
const getPeriodHours = ({
  id,
  label,
}: {
  id: string
  label: string
}) => {
  const text = `${id} ${label}`
  const hourMatch = text.match(
    /(\d+)\s*-?\s*h(?:ours?|r)?\b/i,
  )
  if (hourMatch) {
    return Number(hourMatch[1])
  }
  const dayMatch = text.match(/(\d+)\s*-?\s*d(?:ays?)?\b/i)
  if (dayMatch) {
    return Number(dayMatch[1]) * 24
  }
  if (/\bweek(?:ly|s)?\b/i.test(text)) {
    return WEEK_HOURS
  }
  if (/\bmonth(?:ly|s)?\b/i.test(text)) {
    return MONTH_HOURS
  }
  return /\bdaily\b/i.test(text) ? 24 : undefined
}

const formatAmount = (value: number) =>
  Number.isInteger(value)
    ? value.toLocaleString("en-US")
    : value.toLocaleString("en-US", {
        maximumFractionDigits: 1,
      })

/**
 * "12,400 / 40,000 tokens" out of the producer's free-form extras.
 *
 * The extras bag is per-provider and unversioned, so a missing or oddly-typed
 * entry must read as "this window has no counted amount" rather than fail the
 * whole snapshot. The key names and the wording follow AI Usage's own card, so
 * the panel and the web page never disagree about the same window. A
 * percentage has its own field and is never repeated here.
 */
const getUsedText = (extras: Record<string, unknown>) => {
  const used =
    finiteNumber(extras.used) ??
    finiteNumber(extras.used_credits)
  const limit =
    finiteNumber(extras.limit) ??
    finiteNumber(extras.monthly_limit) ??
    finiteNumber(extras.total)
  if (
    used === undefined ||
    limit === undefined ||
    limit <= 0
  ) {
    return undefined
  }
  const unit = optionalText(extras.unit)
  if (unit === "usd" || unit === "$") {
    return `$${formatAmount(used)} / $${formatAmount(limit)}`
  }
  const amount = `${formatAmount(used)} / ${formatAmount(limit)}`
  return unit ? `${amount} ${unit}` : amount
}

/**
 * Normalize an AI Usage snapshot, whether it arrives over MQTT or the API.
 *
 * Both carry the same producer document, so both come through here. A provider
 * that failed keeps its row: a display that silently drops an unreachable
 * provider looks identical to one showing everything, and the owner learns
 * nothing about the outage.
 */
export const normalizeAiUsage = (
  data: unknown,
): ContractData["ai-usage.v1"] => {
  const document = record(data)
  if (!Array.isArray(document.providers)) {
    throw new Error(
      "An AI Usage snapshot requires a providers array.",
    )
  }
  const fetchedAtMs = parseTimestamp(document.fetched_at)
  return {
    providers: document.providers
      .map(record)
      .map((provider) => {
        const providerId = textValue(provider.provider)
        const windows = Array.isArray(provider.windows)
          ? provider.windows.map(record)
          : []
        const problemText =
          optionalText(provider.error) ??
          optionalText(provider.stale_reason)
        return {
          id: providerId,
          name: getProviderTitle(providerId),
          isOk: provider.is_ok !== false,
          ...(optionalText(provider.plan)
            ? { planText: textValue(provider.plan) }
            : {}),
          ...(problemText ? { problemText } : {}),
          ...(provider.is_cached === true
            ? { isCached: true }
            : {}),
          windows: windows.map((window) => {
            const percentUsed = finiteNumber(
              window.percent_used,
            )
            const resetsAtMs = parseTimestamp(
              window.resets_at,
            )
            const usedText = getUsedText(
              record(window.extras),
            )
            const id = textValue(window.id)
            const label = textValue(window.label)
            const periodHours =
              finiteNumber(window.period_hours) ??
              getPeriodHours({ id, label })
            return {
              id,
              label,
              ...(periodHours === undefined
                ? {}
                : { periodHours }),
              ...(percentUsed === undefined
                ? {}
                : {
                    percentUsed: Math.min(
                      100,
                      Math.max(0, percentUsed),
                    ),
                  }),
              ...(resetsAtMs === undefined
                ? {}
                : { resetsAtMs }),
              ...(usedText ? { usedText } : {}),
            }
          }),
        }
      }),
    ...(fetchedAtMs === undefined ? {} : { fetchedAtMs }),
    ...(document.is_mock === true ? { isMock: true } : {}),
  }
}

/**
 * Read subscription usage straight from an AI Usage installation.
 *
 * Provider credentials stay in AI Usage. CastKit only ever reads the
 * already-normalized snapshot, so this source needs no secret of its own and
 * is safe to point at an instance behind the house proxy.
 */
export const createAiUsageSource: SourceFactory = (
  context,
) => {
  const poll = async () => {
    const response = await sourceRequest({
      context,
      path: "/api/state",
    })
    const snapshot = normalizeAiUsage(await response.json())
    context.channels.forEach((channel) => {
      const providerIds = stringList(
        channel.settings.providerIds,
      )
      context.publish({
        channelId: channel.id,
        data:
          providerIds.length === 0
            ? snapshot
            : {
                ...snapshot,
                providers: snapshot.providers.filter(
                  (provider) =>
                    providerIds.includes(provider.id),
                ),
              },
      })
    })
  }
  return pollingSource({
    context,
    poll,
    /*
     * AI Usage polls its providers no more often than every five minutes and
     * serves a cached answer in between, so a faster poll here would spend
     * requests to read the same numbers back.
     */
    intervalSeconds:
      finiteNumber(context.source.settings.pollSeconds) ??
      300,
  })
}
