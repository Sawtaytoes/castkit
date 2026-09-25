import type { ContractData } from "@castkit/sdk/contracts"
import {
  useLayoutEffect,
  useRef,
  useState,
} from "preact/hooks"
import { useDisplayProperties } from "./displayProperties.ts"

type AiUsageData = ContractData["ai-usage.v1"]
type UsageProvider = AiUsageData["providers"][number]
type UsageWindow = UsageProvider["windows"][number]

/**
 * A usage percentage is only as new as AI Usage's own poll, which is five
 * minutes at its fastest. That is the lifetime the freshness rule measures the
 * panel's repaint against, and it is long enough that every panel in the
 * vocabulary may draw a bar.
 */
const USAGE_LIFETIME_MILLISECONDS = 300_000

/*
 * Row budgeting reuses the agenda view's approach: the view measures its own
 * panel and draws only the rows that finish on the glass. A panel has no
 * scrollbar, so a provider whose last window is cut in half stays cut until
 * the next repaint.
 */
const PROVIDER_HEADING_HEIGHT = 34
const WINDOW_ROW_HEIGHT = 70
/*
 * The heading plus the line that reports what was dropped. The overflow line
 * is reserved whether or not it is needed: a budget that spends its last
 * pixels on a row and then discovers it must also say "1 more limit" has
 * nowhere to put that sentence, and the count silently disappears — which is
 * the one case the whole budget exists to report.
 */
const VIEW_HEADING_HEIGHT = 58

/** A computed length that is absent reads as zero, never as `NaN`. */
const readPixels = (value: string) =>
  Number.parseFloat(value) || 0

const DAY_MILLISECONDS = 86_400_000
const WEEK_MILLISECONDS = 7 * DAY_MILLISECONDS

/**
 * The reset time, in the only form that is still true when the panel settles.
 *
 * ⚠️ A countdown needs TWO things, not one. The panel must repaint before the
 * value moves — that is the freshness rule — and the countdown must be a
 * length a person can hold. "Resets in 240h 0m" passes the first test on a
 * live browser panel and fails the second: nobody reads ten days as hours, and
 * a weekly quota's reset is a weekday.
 */
const formatResetAt = ({
  resetsAtMs,
  now,
  hasRelativeTimes,
}: {
  resetsAtMs: number
  now: number
  hasRelativeTimes: boolean
}) => {
  const remainingMilliseconds = resetsAtMs - now
  if (remainingMilliseconds <= 0) {
    return "Resets now"
  }
  if (
    hasRelativeTimes &&
    remainingMilliseconds < DAY_MILLISECONDS
  ) {
    const remainingMinutes = Math.round(
      remainingMilliseconds / 60_000,
    )
    const hours = Math.floor(remainingMinutes / 60)
    return hours === 0
      ? `Resets in ${remainingMinutes}m`
      : `Resets in ${hours}h ${remainingMinutes % 60}m`
  }
  const resetsAt = new Date(resetsAtMs)
  const timeText = resetsAt.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })
  if (
    resetsAt.toDateString() === new Date(now).toDateString()
  ) {
    return `Resets ${timeText}`
  }
  if (remainingMilliseconds < WEEK_MILLISECONDS) {
    return `Resets ${resetsAt.toLocaleDateString([], {
      weekday: "short",
    })} ${timeText}`
  }
  return `Resets ${resetsAt.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  })}`
}

/** Nearly-spent windows earn the warning and danger surfaces. */
const getWindowIntent = (
  percentUsed: number | undefined,
) => {
  if (percentUsed === undefined) {
    return "neutral"
  }
  if (percentUsed >= 90) {
    return "danger"
  }
  return percentUsed >= 75 ? "warning" : "neutral"
}

const UsageRow = ({
  usageWindow,
  now,
  hasRelativeTimes,
  hasUsageDetail,
}: {
  usageWindow: UsageWindow
  now: number
  hasRelativeTimes: boolean
  hasUsageDetail: boolean
}) => {
  const percentRemaining =
    usageWindow.percentUsed === undefined
      ? undefined
      : Math.max(
          0,
          Math.round((100 - usageWindow.percentUsed) * 10) /
            10,
        )
  return (
    <div
      class="ai-usage-window"
      data-intent={getWindowIntent(usageWindow.percentUsed)}
    >
      <div class="ai-usage-window-head">
        <span class="ai-usage-window-label">
          {usageWindow.label}
        </span>
        {percentRemaining === undefined ? null : (
          <strong class="ai-usage-window-percent">
            {percentRemaining}% left
          </strong>
        )}
      </div>
      {hasUsageDetail &&
      usageWindow.percentUsed !== undefined ? (
        <div class="ai-usage-bar">
          <div
            class="ai-usage-bar-fill"
            style={{ width: `${usageWindow.percentUsed}%` }}
          />
        </div>
      ) : null}
      <div class="ai-usage-window-foot">
        {usageWindow.usedText ? (
          <span>{usageWindow.usedText}</span>
        ) : null}
        {usageWindow.resetsAtMs === undefined ? null : (
          <span class="ai-usage-window-reset">
            {formatResetAt({
              resetsAtMs: usageWindow.resetsAtMs,
              now,
              hasRelativeTimes,
            })}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * How many whole rows this panel can hold, walking providers in order.
 *
 * A heading with no window under it is wasted height, so a provider joins the
 * list only when its heading and at least one of its windows both fit.
 */
const getVisibleProviders = ({
  providers,
  availableHeight,
}: {
  providers: readonly UsageProvider[]
  availableHeight: number
}) =>
  providers.reduce<{
    heightLeft: number
    visible: {
      provider: UsageProvider
      windows: readonly UsageWindow[]
    }[]
  }>(
    (accumulated, provider) => {
      const heightAfterHeading =
        accumulated.heightLeft - PROVIDER_HEADING_HEIGHT
      const windowCount = Math.max(
        0,
        Math.min(
          provider.windows.length,
          Math.floor(
            heightAfterHeading / WINDOW_ROW_HEIGHT,
          ),
        ),
      )
      if (windowCount === 0) {
        return accumulated
      }
      return {
        heightLeft:
          heightAfterHeading -
          windowCount * WINDOW_ROW_HEIGHT,
        visible: accumulated.visible.concat([
          {
            provider,
            windows: provider.windows.slice(0, windowCount),
          },
        ]),
      }
    },
    { heightLeft: availableHeight, visible: [] },
  ).visible

/** Subscription usage per provider, from any source that speaks `ai-usage.v1`. */
export const AiUsageView = ({
  data,
  now,
}: {
  data: AiUsageData
  now: number
}) => {
  const properties = useDisplayProperties()
  const element = useRef<HTMLDivElement>(null)
  const [availableHeight, setAvailableHeight] = useState(0)
  useLayoutEffect(() => {
    const panel = element.current?.parentElement
    if (!panel) {
      return
    }
    const measure = () => {
      const style = getComputedStyle(panel)
      setAvailableHeight(
        panel.clientHeight -
          readPixels(style.paddingTop) -
          readPixels(style.paddingBottom) -
          VIEW_HEADING_HEIGHT,
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(panel)
    return () => observer.disconnect()
  }, [])
  if (data.providers.length === 0) {
    return (
      <div class="platform-empty">
        <h2>No AI subscriptions</h2>
        <p>Configured providers will appear here.</p>
      </div>
    )
  }
  const visible = getVisibleProviders({
    providers: data.providers,
    availableHeight,
  })
  const shownRowCount = visible.reduce(
    (total, entry) => total + entry.windows.length,
    0,
  )
  const mostSpentWindow = data.providers
    .flatMap((provider) =>
      provider.windows.map((usageWindow) => ({
        provider,
        usageWindow,
      })),
    )
    .reduce<
      | {
          provider: UsageProvider
          usageWindow: UsageWindow
        }
      | undefined
    >(
      (highest, candidate) =>
        (candidate.usageWindow.percentUsed ?? -1) >
        (highest?.usageWindow.percentUsed ?? -1)
          ? candidate
          : highest,
      undefined,
    )
  const hiddenRowCount =
    data.providers.reduce(
      (total, provider) => total + provider.windows.length,
      0,
    ) - shownRowCount
  return (
    <div class="ai-usage" ref={element}>
      <h2>AI Usage</h2>
      {visible.map(({ provider, windows }) => (
        <section key={provider.id}>
          <div class="ai-usage-provider-head">
            <h3>{provider.name}</h3>
            {provider.planText ? (
              <span class="ai-usage-plan">
                {provider.planText}
              </span>
            ) : null}
            {provider.isOk ? null : (
              <span class="ai-usage-problem">
                {provider.problemText ?? "Unavailable"}
              </span>
            )}
            {provider.isOk && provider.isCached ? (
              <span class="ai-usage-plan">Last known</span>
            ) : null}
          </div>
          {windows.map((usageWindow) => (
            <UsageRow
              key={usageWindow.id}
              usageWindow={usageWindow}
              now={now}
              hasRelativeTimes={properties.hasRelativeTimes}
              hasUsageDetail={properties.isValueFresh(
                USAGE_LIFETIME_MILLISECONDS,
              )}
            />
          ))}
        </section>
      ))}
      {visible.length === 0 && mostSpentWindow ? (
        /*
         * A panel too short for one whole row still has something true to
         * say. The window closest to spent is the one worth the glass.
         */
        <p class="ai-usage-compact">
          {mostSpentWindow.provider.name}{" "}
          {mostSpentWindow.usageWindow.percentUsed ===
          undefined
            ? mostSpentWindow.usageWindow.label
            : `${Math.max(0, Math.round(100 - mostSpentWindow.usageWindow.percentUsed))}% left`}
        </p>
      ) : null}
      {hiddenRowCount > 0 && visible.length > 0 ? (
        <p class="ai-usage-more">
          {hiddenRowCount} more{" "}
          {hiddenRowCount === 1 ? "limit" : "limits"}
        </p>
      ) : null}
    </div>
  )
}
