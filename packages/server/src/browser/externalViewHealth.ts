/**
 * Server-side health probes for framed external views.
 *
 * A framed application behind a reverse proxy answers 502 while it is down,
 * and an iframe shows that error page and never leaves it. The server asks
 * each view's health URL instead and the panel shows a placeholder until the
 * application answers. The probe runs here, not in the panel, so the framed
 * application needs no CORS headers.
 */

/** How often each health URL is asked. */
const PROBE_INTERVAL_MS = 10_000

/** A probe that has not answered by now counts as a failure. */
const PROBE_TIMEOUT_MS = 5_000

export type ExternalViewHealth = ReturnType<
  typeof createExternalViewHealth
>

export const createExternalViewHealth = ({
  healthUrls,
  onAvailabilityChange,
  intervalMs = PROBE_INTERVAL_MS,
  timeoutMs = PROBE_TIMEOUT_MS,
  fetchHealth = fetch,
}: {
  /** Every URL to probe; duplicates are probed once. */
  healthUrls: readonly string[]
  /** Fires only when a URL's availability differs from the last probe. */
  onAvailabilityChange: (params: {
    healthUrl: string
    isAvailable: boolean
  }) => void
  /** Overridable so a test can drive the cadence without waiting 10 s. */
  intervalMs?: number
  /** Overridable so a test can reach the timeout without waiting 5 s. */
  timeoutMs?: number
  /** Overridable so a test can answer without a network. */
  fetchHealth?: typeof fetch
}) => {
  const distinctHealthUrls = Array.from(new Set(healthUrls))

  // Every URL starts unavailable: a panel must not frame an application
  // nobody has seen answer yet.
  const availabilityByHealthUrl = new Map(
    distinctHealthUrls.map((healthUrl) => [
      healthUrl,
      false,
    ]),
  )

  const schedule: {
    timerId: ReturnType<typeof setTimeout> | null
    isRunning: boolean
  } = { timerId: null, isRunning: false }

  const probe = async (healthUrl: string) => {
    try {
      const response = await fetchHealth(healthUrl, {
        signal: AbortSignal.timeout(timeoutMs),
      })
      // Release the connection; only the status matters.
      await response.body?.cancel().catch(() => {})
      return response.ok
    } catch {
      return false
    }
  }

  const probeAll = async () => {
    const results = await Promise.all(
      distinctHealthUrls.map(async (healthUrl) => ({
        healthUrl,
        isAvailable: await probe(healthUrl),
      })),
    )
    results.forEach(({ healthUrl, isAvailable }) => {
      if (
        availabilityByHealthUrl.get(healthUrl) ===
        isAvailable
      ) {
        return
      }
      availabilityByHealthUrl.set(healthUrl, isAvailable)
      onAvailabilityChange({ healthUrl, isAvailable })
    })
  }

  /**
   * One round, then the next one an interval after it FINISHES, so a slow
   * application never has two probes open against it at once.
   */
  const runRound = async () => {
    await probeAll()
    if (schedule.isRunning) {
      schedule.timerId = setTimeout(() => {
        schedule.timerId = null
        void runRound()
      }, intervalMs)
    }
  }

  return {
    /** Starts probing now. Resolves when the first round has finished. */
    start: async () => {
      if (
        schedule.isRunning ||
        distinctHealthUrls.length === 0
      ) {
        return
      }
      schedule.isRunning = true
      await runRound()
    },
    /** Stops the cadence so a test (or shutdown) can settle. */
    stop: () => {
      schedule.isRunning = false
      if (schedule.timerId !== null) {
        clearTimeout(schedule.timerId)
        schedule.timerId = null
      }
    },
    /** Runs one round outside the cadence. */
    probeAll,
    /** The last probe's answer; `false` for a URL never probed. */
    getIsAvailable: (healthUrl: string) =>
      availabilityByHealthUrl.get(healthUrl) ?? false,
  }
}
