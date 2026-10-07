import {
  builtinContractSchemas,
  type ChannelDefinition,
  type ContractData,
} from "@castkit/sdk/contracts"
import type { SourceFactory } from "@castkit/sdk/plugin"
import {
  finiteNumber,
  record,
  stringList,
  textValue,
} from "./http.ts"

type KidsPointsData = ContractData["kids-points.v1"]
type KidEntry = KidsPointsData["kids"][number]
type KidScan = NonNullable<KidsPointsData["lastScan"]>

/** The per-child retained state topics, one topic per child. */
export const DEFAULT_KIDS_POINTS_STATE_TOPIC =
  "points/state/+"
/** The scan result the points producer publishes once per card scan. */
export const DEFAULT_KIDS_POINTS_SCAN_TOPIC =
  "points/resp/scan"

/**
 * An MQTT topic against a subscription filter: `+` is one level, `#` is
 * every level from there on. The platform forwards every broker message to
 * every source, so a source that subscribes with a wildcard has to recognise
 * its own messages itself.
 */
export const isTopicMatch = ({
  filter,
  topic,
}: {
  filter: string
  topic: string
}) => {
  const filterLevels = filter.split("/")
  const topicLevels = topic.split("/")
  const wildcardIndex = filterLevels.indexOf("#")
  const comparedLevels =
    wildcardIndex === -1
      ? filterLevels
      : filterLevels.slice(0, wildcardIndex)
  return (
    (wildcardIndex === -1
      ? topicLevels.length === filterLevels.length
      : topicLevels.length >= wildcardIndex) &&
    comparedLevels.every(
      (level, index) =>
        level === "+" || level === topicLevels[index],
    )
  )
}

const hexColor = (value: unknown) => {
  const text = textValue(value)
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : undefined
}

const positiveNumber = (value: unknown) => {
  const number = finiteNumber(value)
  return number !== undefined && number > 0
    ? number
    : undefined
}

/**
 * One child's retained state, from either the canonical entry shape or the
 * points producer's own `points/state/<id>` document (`kid`, `kidName`,
 * `kidColor`, `runningSession`). A document without an id or a number for
 * today is not a child's state and is ignored.
 */
export const normalizeKidState = (
  data: unknown,
): KidEntry | undefined => {
  const raw = record(data)
  const id = textValue(raw.id) || textValue(raw.kid)
  const pointsToday = finiteNumber(raw.pointsToday)
  if (!id || pointsToday === undefined) {
    return undefined
  }
  const session = record(
    raw.activeTask ?? raw.runningSession,
  )
  const sessionName =
    textValue(session.name) || textValue(session.taskName)
  const sessionStartedAtMs =
    finiteNumber(session.startedAtMs) ??
    finiteNumber(session.startedMs)
  const goalMinutes = positiveNumber(session.goalMinutes)
  const goal = positiveNumber(raw.goal)
  const color = hexColor(raw.color ?? raw.kidColor)
  const displayOrder = finiteNumber(raw.displayOrder)
  const lastTask = textValue(raw.lastTask)
  return {
    id,
    name:
      textValue(raw.name) || textValue(raw.kidName) || id,
    pointsToday,
    ...(displayOrder !== undefined &&
    Number.isInteger(displayOrder) &&
    displayOrder >= 0
      ? { displayOrder }
      : {}),
    ...(goal === undefined ? {} : { goal }),
    ...(color ? { color } : {}),
    ...(lastTask ? { lastTask } : {}),
    ...(sessionName && sessionStartedAtMs !== undefined
      ? {
          activeTask: {
            name: sessionName,
            startedAtMs: sessionStartedAtMs,
            ...(goalMinutes === undefined
              ? {}
              : { goalMinutes }),
            ...(typeof session.isCountdown === "boolean"
              ? { isCountdown: session.isCountdown }
              : {}),
          },
        }
      : {}),
  }
}

const SCAN_RESULTS: Record<string, KidScan["result"]> = {
  award: "awarded",
  awarded: "awarded",
  "session-start": "started",
  started: "started",
  "session-stop": "stopped",
  stopped: "stopped",
  "session-progress": "progress",
  "session-milestone": "progress",
  progress: "progress",
}

/**
 * One scan result, plus what it says about the child's day. The producer's
 * outcome vocabulary is wider than a display needs; everything that is not a
 * payment, timer or progress notification is a refusal ("too early", "already done", "busy"), and
 * the producer's own sentence explains which.
 */
export const normalizeKidScan = (
  data: unknown,
):
  | {
      scan: KidScan
      pointsToday?: number
      goal?: number
      name?: string
    }
  | undefined => {
  const raw = record(data)
  const kidId = textValue(raw.kidId) || textValue(raw.kid)
  const atMs =
    finiteNumber(raw.atMs) ?? finiteNumber(raw.ts)
  if (!kidId || atMs === undefined) {
    return undefined
  }
  const taskName = textValue(raw.taskName)
  const message = textValue(raw.message)
  const reader = textValue(raw.reader)
  const name = textValue(raw.kidName)
  return {
    scan: {
      kidId,
      result:
        SCAN_RESULTS[
          textValue(raw.result) || textValue(raw.outcome)
        ] ?? "refused",
      points: finiteNumber(raw.points) ?? 0,
      ...(taskName ? { taskName } : {}),
      ...(message ? { message } : {}),
      ...(reader ? { reader } : {}),
      atMs,
    },
    pointsToday: finiteNumber(raw.pointsToday),
    goal: positiveNumber(raw.goal),
    ...(name ? { name } : {}),
  }
}

/**
 * What one channel shows: children in the producer's manual order, with
 * names as the stable fallback for older states without positions, and the
 * last scan it accepted.
 */
export const buildKidsPointsData = ({
  kids,
  channel,
  lastScan,
  timerScans,
}: {
  kids: readonly KidEntry[]
  channel: ChannelDefinition
  lastScan?: KidScan
  timerScans?: KidScan[]
}): KidsPointsData => {
  const kidIds = stringList(channel.settings.kidIds)
  const selected = kids
    .filter(
      (kid) =>
        kidIds.length === 0 || kidIds.includes(kid.id),
    )
    .toSorted(
      (left, right) =>
        (left.displayOrder ?? Number.MAX_SAFE_INTEGER) -
          (right.displayOrder ?? Number.MAX_SAFE_INTEGER) ||
        left.name.localeCompare(right.name),
    )
  return {
    kids: selected,
    ...(timerScans?.length
      ? {
          timerScans: timerScans.filter((scan) =>
            selected.some((kid) => kid.id === scan.kidId),
          ),
        }
      : {}),
    ...(lastScan &&
    selected.some((kid) => kid.id === lastScan.kidId)
      ? { lastScan }
      : {}),
  }
}

/** A channel with no reader list hears every reader. */
const isReaderAccepted = ({
  channel,
  reader,
}: {
  channel: ChannelDefinition
  reader: string | undefined
}) => {
  const readers = stringList(channel.settings.readers)
  return (
    readers.length === 0 ||
    (reader !== undefined && readers.includes(reader))
  )
}

/**
 * A household points board over MQTT: every child's retained state from a
 * wildcard topic, and each card scan from a result topic. The source never
 * awards anything; it only reads what the points producer already decided.
 *
 * A channel may narrow the board to some children (`kidIds`) and may hear
 * scans only from some readers (`readers`), which is what lets a room's
 * display react to the room's own reader and ignore the one downstairs.
 */
export const createKidsPointsSource: SourceFactory = (
  context,
) => {
  const stateTopic =
    textValue(context.source.settings.stateTopic) ||
    DEFAULT_KIDS_POINTS_STATE_TOPIC
  const scanTopic =
    textValue(context.source.settings.scanTopic) ||
    DEFAULT_KIDS_POINTS_SCAN_TOPIC
  const kids = new Map<string, KidEntry>()
  const lastScans = new Map<string, KidScan>()
  const timerScans = new Map<string, Map<string, KidScan>>()
  const readers = new Set<string>()
  const publishAll = () => {
    const entries = Array.from(kids.values())
    context.channels.forEach((channel) => {
      context.publish({
        channelId: channel.id,
        data: buildKidsPointsData({
          kids: entries,
          channel,
          lastScan: lastScans.get(channel.id),
          timerScans: Array.from(
            timerScans.get(channel.id)?.values() ?? [],
          ),
        }),
      })
    })
  }
  const reportAll = (error: string) =>
    context.channels.forEach((channel) => {
      context.reportError({ channelId: channel.id, error })
    })
  const parse = (payload: string) => {
    try {
      return { data: JSON.parse(payload) as unknown }
    } catch {
      return undefined
    }
  }
  const handleState = (data: unknown) => {
    const canonical =
      builtinContractSchemas["kids-points.v1"].safeParse(
        data,
      )
    if (canonical.success) {
      canonical.data.kids.forEach((kid) => {
        kids.set(kid.id, kid)
      })
      return true
    }
    const kid = normalizeKidState(data)
    if (!kid) {
      return false
    }
    kids.set(kid.id, kid)
    return true
  }
  const handleScan = (data: unknown) => {
    const normalized = normalizeKidScan(data)
    if (!normalized) {
      return false
    }
    const { scan } = normalized
    if (scan.reader) {
      readers.add(scan.reader)
    }
    const known = kids.get(scan.kidId)
    // The scan result lands before the producer re-publishes the child's
    // state, so the total it carries is the newest one there is.
    if (known || normalized.pointsToday !== undefined) {
      kids.set(scan.kidId, {
        ...(known ?? {
          id: scan.kidId,
          name: normalized.name ?? scan.kidId,
          pointsToday: 0,
        }),
        ...(normalized.pointsToday === undefined
          ? {}
          : { pointsToday: normalized.pointsToday }),
        ...(normalized.goal === undefined
          ? {}
          : { goal: normalized.goal }),
        ...(scan.taskName && scan.result === "awarded"
          ? { lastTask: scan.taskName }
          : {}),
      })
    }
    context.channels
      .filter((channel) =>
        isReaderAccepted({ channel, reader: scan.reader }),
      )
      .forEach((channel) => {
        lastScans.set(channel.id, scan)
        const acceptedTimers =
          timerScans.get(channel.id) ??
          new Map<string, KidScan>()
        if (
          scan.result === "started" ||
          scan.result === "progress"
        ) {
          acceptedTimers.set(scan.kidId, scan)
        } else if (
          scan.result === "stopped" ||
          scan.result === "awarded"
        ) {
          acceptedTimers.delete(scan.kidId)
        }
        timerScans.set(channel.id, acceptedTimers)
      })
    return true
  }
  return {
    start: async () => {
      if (!context.mqtt) {
        throw new Error("MQTT is not configured.")
      }
      await Promise.all([
        context.mqtt.subscribe(stateTopic),
        context.mqtt.subscribe(scanTopic),
      ])
    },
    dispose: () => {
      void context.mqtt?.unsubscribe?.(stateTopic)
      void context.mqtt?.unsubscribe?.(scanTopic)
    },
    handleMqttMessage: ({ topic, payload }) => {
      const isState = isTopicMatch({
        filter: stateTopic,
        topic,
      })
      const isScan = isTopicMatch({
        filter: scanTopic,
        topic,
      })
      // An empty payload clears a retained topic; it is not a bad message.
      if ((!isState && !isScan) || !payload.trim()) {
        return
      }
      const parsed = parse(payload)
      if (!parsed) {
        reportAll("The points payload is not valid JSON.")
        return
      }
      const isHandled = isScan
        ? handleScan(parsed.data)
        : handleState(parsed.data)
      if (isHandled) {
        publishAll()
      }
    },
    discover: async () => ({
      kids: Array.from(kids.values()).map((kid) => ({
        id: kid.id,
        name: kid.name,
      })),
      readers: Array.from(readers).map((reader) => ({
        id: reader,
        name: reader,
      })),
    }),
  }
}
