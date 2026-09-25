import type { SourceContext } from "@castkit/sdk/plugin"

/** Guard source addresses and prevent credentials from escaping through redirects. */
export const sourceUrl = ({
  baseUrl,
  path,
}: {
  baseUrl: unknown
  path: string
}) => {
  if (typeof baseUrl !== "string") {
    throw new Error("A source URL is required.")
  }
  const base = new URL(baseUrl)
  if (
    !["http:", "https:"].includes(base.protocol) ||
    base.username ||
    base.password
  ) {
    throw new Error(
      "Source URLs must use HTTP or HTTPS without embedded credentials.",
    )
  }
  const resolved = new URL(
    `${base.pathname.replace(/\/$/, "")}${path}`,
    base.origin,
  )
  if (resolved.origin !== base.origin) {
    throw new Error(
      "Source request paths must stay on the configured origin.",
    )
  }
  return resolved.toString()
}
/** Fetch against the configured source with a deadline and cancellation. */
export const sourceRequest = async ({
  context,
  path,
  method = "GET",
  body,
  headers = {},
  timeoutMilliseconds = 10000,
}: {
  context: SourceContext
  path: string
  method?: string
  body?: unknown
  headers?: Record<string, string>
  timeoutMilliseconds?: number
}) => {
  const response = await context.fetch(
    sourceUrl({
      baseUrl: context.source.settings.url,
      path,
    }),
    {
      method,
      headers: {
        ...headers,
        ...(body === undefined
          ? {}
          : { "Content-Type": "application/json" }),
      },
      ...(body === undefined
        ? {}
        : { body: JSON.stringify(body) }),
      signal: AbortSignal.any([
        context.signal,
        AbortSignal.timeout(timeoutMilliseconds),
      ]),
      redirect: "error",
    },
  )
  if (!response.ok) {
    throw new Error(
      `The source returned HTTP ${response.status}.`,
    )
  }
  return response
}
/** Non-overlapping source polling with bounded intervals and disposal. */
export const pollingSource = ({
  context,
  poll,
  intervalSeconds = 30,
}: {
  context: SourceContext
  poll: () => Promise<void>
  intervalSeconds?: number
}) => {
  const state: {
    isStopped: boolean
    timer: ReturnType<typeof setTimeout> | undefined
  } = { isStopped: false, timer: undefined }
  const run = async () => {
    if (state.isStopped || context.signal.aborted) {
      return
    }
    try {
      await poll()
    } catch {
      if (!state.isStopped && !context.signal.aborted) {
        context.channels.forEach((channel) => {
          context.reportError({
            channelId: channel.id,
            error:
              "The source could not be reached or returned invalid data.",
          })
        })
      }
    }
    if (!state.isStopped && !context.signal.aborted) {
      state.timer = setTimeout(
        () => {
          void run()
        },
        Math.max(1, Math.min(86400, intervalSeconds)) *
          1000,
      )
      state.timer.unref()
    }
  }
  return {
    start: run,
    dispose: () => {
      state.isStopped = true
      if (state.timer) {
        clearTimeout(state.timer)
      }
    },
  }
}
/** Safe object coercion for third-party JSON. */
export const record = (
  value: unknown,
): Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
/** String-only values from an optional list. */
export const stringList = (value: unknown) =>
  Array.isArray(value)
    ? value.filter(
        (entry): entry is string =>
          typeof entry === "string",
      )
    : typeof value === "string"
      ? value
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean)
      : []
/** Finite optional numeric reading. */
export const finiteNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined
/** Text without a coerced undefined/null value. */
export const textValue = (value: unknown) =>
  typeof value === "string" ? value : ""
