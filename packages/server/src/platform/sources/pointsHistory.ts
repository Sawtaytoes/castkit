import { randomUUID } from "node:crypto"
import { builtinContractSchemas } from "@castkit/sdk/contracts"
import type { SourceFactory } from "@castkit/sdk/plugin"
import { record, stringList, textValue } from "./http.ts"
import { isTopicMatch } from "./kidsPoints.ts"

/** Default request/reply topics; points calculations belong to the producer. */
export const DEFAULT_POINTS_REPORT_REQUEST_TOPIC =
  "tally-marks/cmd/reports/points"
/** Non-retained responses correlate with an opaque request ID. */
export const DEFAULT_POINTS_REPORT_RESPONSE_TOPIC =
  "tally-marks/resp/reports/points"
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
const firstDay = (days: number) => {
  const date = new Date(`${today()}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() - days + 1)
  return date.toISOString().slice(0, 10)
}
/** Fetches historical summaries on startup and points changes, without a new polling schedule. */
export const createPointsHistorySource: SourceFactory = (
  context,
) => {
  const requestTopic =
    textValue(context.source.settings.requestTopic) ||
    DEFAULT_POINTS_REPORT_REQUEST_TOPIC
  const responseTopic =
    textValue(context.source.settings.responseTopic) ||
    DEFAULT_POINTS_REPORT_RESPONSE_TOPIC
  const stateTopic =
    textValue(context.source.settings.stateTopic) ||
    "points/state/+"
  const ledgerTopic =
    textValue(context.source.settings.ledgerTopic) ||
    "points/ledger"
  const goalTopic =
    textValue(context.source.settings.goalTopic) ||
    "tally-marks/resp/daily-goal"
  const stateSignatures = new Map<string, string>()
  const state = {
    queue: new Set(
      context.channels.map((channel) => channel.id),
    ),
    pending: undefined as
      | { id: string; channelId: string }
      | undefined,
    timeout: undefined as
      | ReturnType<typeof setTimeout>
      | undefined,
    debounce: undefined as
      | ReturnType<typeof setTimeout>
      | undefined,
    isDisposed: false,
  }
  const requestNext = () => {
    if (
      state.isDisposed ||
      state.pending ||
      !context.mqtt
    ) {
      return
    }
    const channelId = [...state.queue][0]
    const channel = context.channels.find(
      (candidate) => candidate.id === channelId,
    )
    if (!channel) {
      return
    }
    state.queue.delete(channelId)
    const id = randomUUID()
    state.pending = { id, channelId }
    const configuredDays = Number(
      channel.settings.days ?? 7,
    )
    const days = Number.isFinite(configuredDays)
      ? Math.max(
          1,
          Math.min(366, Math.floor(configuredDays)),
        )
      : 7
    state.timeout = setTimeout(() => {
      context.reportError({
        channelId,
        error:
          "The points service did not answer. The last report may be out of date.",
      })
      state.pending = undefined
      requestNext()
    }, 12000)
    void Promise.resolve(
      context.mqtt.publish({
        topic: requestTopic,
        payload: JSON.stringify({
          requestId: id,
          from: firstDay(days),
          to: today(),
        }),
        isRetained: false,
      }),
    ).catch(() => {
      context.reportError({
        channelId,
        error:
          "The points report request could not be sent.",
      })
    })
  }
  const refresh = () => {
    clearTimeout(state.debounce)
    state.debounce = setTimeout(() => {
      context.channels.forEach((channel) => {
        state.queue.add(channel.id)
      })
      requestNext()
    }, 500)
  }
  return {
    start: async () => {
      if (!context.mqtt) {
        throw new Error("MQTT is not configured.")
      }
      await Promise.all(
        [
          responseTopic,
          stateTopic,
          ledgerTopic,
          goalTopic,
        ].map((topic) => context.mqtt?.subscribe(topic)),
      )
      requestNext()
    },
    dispose: () => {
      state.isDisposed = true
      clearTimeout(state.timeout)
      clearTimeout(state.debounce)
      ;[
        responseTopic,
        stateTopic,
        ledgerTopic,
        goalTopic,
      ].forEach((topic) => {
        void context.mqtt?.unsubscribe?.(topic)
      })
    },
    handleMqttMessage: ({ topic, payload }) => {
      if (state.isDisposed) {
        return
      }
      if (topic !== responseTopic) {
        if (isTopicMatch({ filter: stateTopic, topic })) {
          try {
            const value = record(JSON.parse(payload))
            const signature = JSON.stringify([
              value.day,
              value.pointsToday,
              value.goal,
            ])
            if (stateSignatures.get(topic) !== signature) {
              stateSignatures.set(topic, signature)
              refresh()
            }
          } catch {
            /* An invalid state does not change the report. */
          }
        } else if (
          [ledgerTopic, goalTopic].some((filter) =>
            isTopicMatch({ filter, topic }),
          )
        ) {
          refresh()
        }
        return
      }
      try {
        const response = record(JSON.parse(payload))
        const pending = state.pending
        if (!pending || response.requestId !== pending.id) {
          return
        }
        clearTimeout(state.timeout)
        state.pending = undefined
        const result = builtinContractSchemas[
          "points-history.v1"
        ].safeParse(response.report)
        const channel = context.channels.find(
          (candidate) => candidate.id === pending.channelId,
        )
        if (result.success && channel) {
          const selected = stringList(
            channel.settings.kidIds,
          )
          context.publish({
            channelId: channel.id,
            data: {
              ...result.data,
              children: result.data.children.filter(
                (child) =>
                  selected.length === 0 ||
                  selected.includes(child.id),
              ),
            },
          })
        } else {
          context.reportError({
            channelId: pending.channelId,
            error:
              "The points service did not return a valid history report.",
          })
        }
        requestNext()
      } catch {
        // Unrelated or malformed broker messages cannot clear a pending request.
      }
    },
  }
}
