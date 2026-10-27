import type { ContractData } from "@castkit/sdk/contracts"
import { compactClockTime } from "@castkit/shared/compactClockTime"
import {
  useLayoutEffect,
  useRef,
  useState,
} from "preact/hooks"
import { getDateTimeFormatter } from "../formatters.ts"
import { AiUsageProviderIcon } from "./AiUsageProviderIcon.tsx"
import { placeSections } from "./aiUsageLayout.ts"
import {
  readAlertPercent,
  selectProviderRows,
} from "./aiUsageRows.ts"
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
 * the next repaint. The arithmetic — type scale, column count, which section
 * lands where — is `placeSections`, and the row heights it budgets against
 * are the same base numbers the stylesheet multiplies by `--ai-usage-scale`.
 */

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
  const timeText = compactClockTime(
    getDateTimeFormatter({
      locale: "en-US",
      options: { hour: "numeric", minute: "2-digit" },
    }).format(resetsAt),
  )
  if (
    resetsAt.toDateString() === new Date(now).toDateString()
  ) {
    return `Resets ${timeText}`
  }
  if (remainingMilliseconds < WEEK_MILLISECONDS) {
    return `Resets ${getDateTimeFormatter({ options: { weekday: "short" } }).format(resetsAt)} ${timeText}`
  }
  return `Resets ${getDateTimeFormatter({ options: { month: "short", day: "numeric" } }).format(resetsAt)}`
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

/** Remaining quota, rounded to the same precision on every row. */
const remainingPercent = (usageWindow: UsageWindow) =>
  usageWindow.percentUsed === undefined
    ? undefined
    : Math.max(
        0,
        Math.round((100 - usageWindow.percentUsed) * 10) /
          10,
      )

const UsagePercent = ({
  usageWindow,
}: {
  usageWindow?: UsageWindow
}) => {
  const percent = usageWindow
    ? remainingPercent(usageWindow)
    : undefined
  return percent === undefined ? null : (
    <strong class="ai-usage-window-percent">
      {percent}%
    </strong>
  )
}

const UsageRow = ({
  usageWindow,
  isEscalated,
  now,
  hasRelativeTimes,
  hasUsageDetail,
  hasLabel = isEscalated,
  hasResetFallback = false,
}: {
  usageWindow: UsageWindow
  isEscalated: boolean
  now: number
  hasRelativeTimes: boolean
  hasUsageDetail: boolean
  hasLabel?: boolean
  hasResetFallback?: boolean
}) => {
  return (
    <div
      class="ai-usage-window"
      data-escalated={isEscalated ? "true" : "false"}
      data-intent={getWindowIntent(usageWindow.percentUsed)}
    >
      {hasLabel ? (
        <div class="ai-usage-window-head">
          <span class="ai-usage-window-label">
            {usageWindow.label}
          </span>
          <UsagePercent usageWindow={usageWindow} />
        </div>
      ) : null}
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
        {usageWindow.resetsAtMs === undefined ? (
          hasResetFallback ? (
            <span>Reset time unavailable</span>
          ) : null
        ) : (
          <span class="ai-usage-window-reset">
            {hasResetFallback
              ? `Resets ${getDateTimeFormatter({ options: { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" } }).format(new Date(usageWindow.resetsAtMs))}`
              : formatResetAt({
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

/** All reported limits stay available without changing the glanceable summary. */
const ProviderDetails = ({
  provider,
  now,
  onClose,
}: {
  provider: UsageProvider | undefined
  now: number
  onClose: () => void
}) => {
  const dialog = useRef<HTMLDialogElement>(null)
  const contact = useRef<{
    pointerId: number
    startY: number
    scrollTop: number
  }>()
  const hasDragged = useRef(false)
  const properties = useDisplayProperties()
  useLayoutEffect(() => {
    const element = dialog.current
    if (!element) {
      return
    }
    if (provider && !element.open) {
      element.showModal()
    } else if (!provider && element.open) {
      element.close()
    }
  }, [provider])
  return (
    <dialog
      ref={dialog}
      class="ai-usage-details"
      data-castkit-target={`scroll:ai-usage:${provider?.id ?? "closed"}`}
      data-castkit-scroll="true"
      onPointerDown={(event) => {
        event.stopPropagation()
        hasDragged.current = false
        contact.current = {
          pointerId: event.pointerId,
          startY: event.clientY,
          scrollTop: event.currentTarget.scrollTop,
        }
      }}
      onPointerMove={(event) => {
        event.stopPropagation()
        if (
          contact.current?.pointerId !== event.pointerId
        ) {
          return
        }
        if (
          Math.abs(contact.current.startY - event.clientY) >
          8
        ) {
          hasDragged.current = true
          event.currentTarget.setPointerCapture(
            event.pointerId,
          )
        }
        if (hasDragged.current) {
          event.currentTarget.scrollTop =
            contact.current.scrollTop +
            contact.current.startY -
            event.clientY
        }
      }}
      onPointerUp={(event) => {
        event.stopPropagation()
        contact.current = undefined
      }}
      onPointerCancel={(event) => {
        event.stopPropagation()
        hasDragged.current = true
        contact.current = undefined
      }}
      aria-label={
        provider
          ? `${provider.name} usage details`
          : undefined
      }
      onKeyDown={(event) => {
        hasDragged.current = false
        if (event.key === "Escape") {
          event.preventDefault()
          onClose()
        }
      }}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClose={() => {
        if (!dialog.current?.open) {
          onClose()
        }
      }}
      onClick={(event) => {
        if (
          !hasDragged.current &&
          event.target === event.currentTarget
        ) {
          const bounds =
            event.currentTarget.getBoundingClientRect()
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          ) {
            onClose()
          }
        }
      }}
    >
      {provider ? (
        <div class="ai-usage-details-content">
          <header>
            <AiUsageProviderIcon providerId={provider.id} />
            <h2>{provider.name}</h2>
            <button
              type="button"
              onClick={() => {
                if (!hasDragged.current) {
                  onClose()
                }
              }}
              aria-label="Close usage details"
            >
              Close
            </button>
          </header>
          {!provider.isOk ? (
            <p class="ai-usage-problem">
              {provider.problemText ?? "Unavailable"}
            </p>
          ) : null}
          {provider.isCached ? (
            <p class="ai-usage-status">Last known usage</p>
          ) : null}
          <p class="ai-usage-status">
            Percentages show remaining quota.
          </p>
          {provider.windows.length === 0 ? (
            <p>No usage limits reported.</p>
          ) : null}
          {provider.windows.map((usageWindow) => (
            <UsageRow
              key={usageWindow.id}
              usageWindow={usageWindow}
              isEscalated={false}
              hasLabel
              hasResetFallback
              now={now}
              hasRelativeTimes={properties.hasRelativeTimes}
              hasUsageDetail={properties.isValueFresh(
                USAGE_LIFETIME_MILLISECONDS,
              )}
            />
          ))}
        </div>
      ) : null}
    </dialog>
  )
}

/**
 * Subscription usage per provider, from any source that speaks `ai-usage.v1`.
 *
 * Each provider gets one headline row — its weekly budget — and a second row
 * only when another of its limits is already at or past `alertPercent`. That
 * is a reading surface, not a table: the panel answers "is anything about to
 * stop me" at a glance and stays quiet otherwise.
 */
export const AiUsageView = ({
  data,
  now,
  settings,
}: {
  data: AiUsageData
  now: number
  settings?: Record<string, unknown>
}) => {
  const properties = useDisplayProperties()
  const [selectedProviderId, setSelectedProviderId] =
    useState<string>()
  const selectedProvider = data.providers.find(
    (provider) => provider.id === selectedProviderId,
  )
  const element = useRef<HTMLDivElement>(null)
  const [contentBox, setContentBox] = useState({
    width: 0,
    height: 0,
  })
  useLayoutEffect(() => {
    const panel = element.current?.parentElement
    if (!panel) {
      return
    }
    const measure = () => {
      const style = getComputedStyle(panel)
      setContentBox({
        width:
          panel.clientWidth -
          readPixels(style.paddingLeft) -
          readPixels(style.paddingRight),
        height:
          panel.clientHeight -
          readPixels(style.paddingTop) -
          readPixels(style.paddingBottom),
      })
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
  const providerRows = selectProviderRows({
    providers: data.providers,
    alertPercent: readAlertPercent(settings),
  })
  const hasViewHeading = settings?.isAdaptiveLayout !== true
  const layout = placeSections({
    providerRows,
    width: contentBox.width,
    height: contentBox.height,
    isAdaptive: settings?.isAdaptiveLayout === true,
    minimumScale:
      settings?.isAdaptiveLayout === true ? 0.65 : 1,
    hasViewHeading,
  })
  const mostSpentWindow = providerRows
    .flatMap((entry) =>
      entry.rows.map((row) => ({
        provider: entry.provider,
        usageWindow: row.usageWindow,
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
  /*
   * Only the rows the rule already chose are counted. A limit the rule
   * withheld is not missing from the panel, and reporting it as "1 more
   * limit" would send the reader looking for something the view decided was
   * not worth their attention.
   */
  const { hiddenRowCount } = layout
  const isEmpty = layout.columns.length === 0
  return (
    <div
      class="ai-usage"
      data-color-mode={
        properties.properties?.colorMode ?? "full"
      }
      style={{
        "--ai-usage-scale": layout.scale,
        "--ai-usage-columns": layout.columnCount,
      }}
      ref={element}
    >
      {hasViewHeading ? <h2>AI Usage</h2> : null}
      <div class="ai-usage-columns">
        {layout.columns.map((sections, columnIndex) => (
          <div class="ai-usage-column" key={columnIndex}>
            {sections.map(({ provider, rows }) => (
              <section
                key={provider.id}
                class="ai-usage-provider"
              >
                {properties.isInteractive ? (
                  <button
                    type="button"
                    class="ai-usage-provider-trigger"
                    aria-label={`Show ${provider.name} usage details`}
                    aria-haspopup="dialog"
                    onClick={() =>
                      setSelectedProviderId(provider.id)
                    }
                  />
                ) : null}
                <div class="ai-usage-provider-head">
                  <AiUsageProviderIcon
                    providerId={provider.id}
                  />
                  <h3>{provider.name}</h3>
                  <UsagePercent
                    usageWindow={
                      rows.find((row) => !row.isEscalated)
                        ?.usageWindow
                    }
                  />
                  {provider.isOk ? null : (
                    <span class="ai-usage-problem">
                      {provider.problemText ??
                        "Unavailable"}
                    </span>
                  )}
                  {provider.isOk && provider.isCached ? (
                    <span class="ai-usage-status">
                      Last known
                    </span>
                  ) : null}
                </div>
                {rows.map(
                  ({ usageWindow, isEscalated }) => (
                    <UsageRow
                      key={usageWindow.id}
                      usageWindow={usageWindow}
                      isEscalated={isEscalated}
                      now={now}
                      hasRelativeTimes={
                        properties.hasRelativeTimes
                      }
                      hasUsageDetail={properties.isValueFresh(
                        USAGE_LIFETIME_MILLISECONDS,
                      )}
                    />
                  ),
                )}
              </section>
            ))}
          </div>
        ))}
      </div>
      {isEmpty && mostSpentWindow ? (
        /*
         * A panel too short for one whole row still has something true to
         * say. The window closest to spent is the one worth the glass.
         */
        <p class="ai-usage-compact ai-usage-provider">
          {properties.isInteractive ? (
            <button
              type="button"
              class="ai-usage-provider-trigger"
              aria-label={`Show ${mostSpentWindow.provider.name} usage details`}
              aria-haspopup="dialog"
              onClick={() =>
                setSelectedProviderId(
                  mostSpentWindow.provider.id,
                )
              }
            />
          ) : null}
          {mostSpentWindow.provider.name}{" "}
          {mostSpentWindow.usageWindow.percentUsed ===
          undefined
            ? mostSpentWindow.usageWindow.label
            : `${remainingPercent(mostSpentWindow.usageWindow)}%`}
        </p>
      ) : null}
      <ProviderDetails
        provider={
          properties.isInteractive
            ? selectedProvider
            : undefined
        }
        now={now}
        onClose={() => setSelectedProviderId(undefined)}
      />
      {hiddenRowCount > 0 && !isEmpty ? (
        <p class="ai-usage-more">
          {hiddenRowCount} more{" "}
          {hiddenRowCount === 1 ? "limit" : "limits"}
        </p>
      ) : null}
    </div>
  )
}
