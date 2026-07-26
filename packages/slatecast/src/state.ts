import type { DeviceCommand } from "@castkit/shared/protocol/commands"
import {
  type BrowserDeviceProfile,
  type BrowserDeviceSettings,
  type ClientToServerMessage,
  DEFAULT_PHOTO_INTERVAL_MINUTES,
  type ServerToClientMessage,
} from "@castkit/shared/protocol/ws"
import type {
  AgendaData,
  NowPlayingData,
  QueueData,
  WeatherData,
} from "@castkit/shared/viewData/types"
import { computed, signal } from "@preact/signals"

/**
 * All client state as signals, fed by the inlined page snapshot and then the
 * WebSocket. The live seek position is computed locally at 1 Hz from the last
 * pushed position + its timestamp — no per-second network traffic.
 *
 * Controls are optimistic: a tap's predicted result paints immediately and is
 * reconciled when HA's real state arrives. The command path is unchanged (still
 * pure MQTT through HA), but that round trip crosses the broker twice, so
 * without a prediction every button visibly waits on it.
 */

/**
 * How long an unconfirmed prediction survives before the server's truth wins
 * again. Long enough for a slow HA automation, short enough that a command HA
 * silently dropped doesn't leave the screen lying indefinitely.
 */
const OPTIMISTIC_TIMEOUT_MS = 5_000

/** Volume commands sent at most this often while a finger drags the slider. */
const VOLUME_SEND_INTERVAL_MS = 150

/** A volume this close to the prediction counts as HA confirming it. */
const VOLUME_MATCH_EPSILON = 0.02

type Snapshot = Extract<
  ServerToClientMessage,
  { type: "snapshot" }
>

const readInlineSnapshot = (): Snapshot | null => {
  const element = document.getElementById("castkit-state")
  if (!element?.textContent) {
    return null
  }
  try {
    return JSON.parse(element.textContent) as Snapshot
  } catch {
    return null
  }
}

const DEFAULT_SETTINGS: BrowserDeviceSettings = {
  orientation: 0,
  theme: "Auto",
  photoIntervalMinutes: DEFAULT_PHOTO_INTERVAL_MINUTES,
}

const inlineSnapshot = readInlineSnapshot()

export const device = signal<BrowserDeviceProfile | null>(
  inlineSnapshot?.device ?? null,
)
export const settings = signal<BrowserDeviceSettings>(
  inlineSnapshot?.settings ?? DEFAULT_SETTINGS,
)
export const activeView = signal<string>(
  inlineSnapshot?.view ?? "now-playing",
)
/** The last now-playing state Home Assistant pushed, unmodified. */
const nowPlayingFromServer = signal<NowPlayingData | null>(
  inlineSnapshot?.data.nowPlaying ?? null,
)

/**
 * Fields predicted from a local tap, overlaid on the server's state until HA
 * confirms them (or {@link OPTIMISTIC_TIMEOUT_MS} elapses).
 */
const optimisticFields =
  signal<Partial<NowPlayingData> | null>(null)

/** Holds the pending expiry timer; an object so nothing has to be reassigned. */
const optimisticExpiry: { timerId: number | null } = {
  timerId: null,
}

const clearOptimisticFields = () => {
  if (optimisticExpiry.timerId !== null) {
    window.clearTimeout(optimisticExpiry.timerId)
    optimisticExpiry.timerId = null
  }
  optimisticFields.value = null
}

/**
 * Paint a predicted change now. Merges into any prediction already in flight so
 * a volume drag doesn't discard a pause that HA hasn't confirmed yet.
 */
const predict = (predicted: Partial<NowPlayingData>) => {
  optimisticFields.value = {
    ...(optimisticFields.value ?? {}),
    ...predicted,
  }
  if (optimisticExpiry.timerId !== null) {
    window.clearTimeout(optimisticExpiry.timerId)
  }
  optimisticExpiry.timerId = window.setTimeout(
    clearOptimisticFields,
    OPTIMISTIC_TIMEOUT_MS,
  )
}

/**
 * The server's state with any in-flight prediction painted over it. Returns the
 * server object by reference when nothing is predicted, so subscribers don't
 * re-render on an unchanged push.
 */
export const nowPlaying = computed(() => {
  const serverData = nowPlayingFromServer.value
  const predicted = optimisticFields.value
  if (!serverData || !predicted) {
    return serverData
  }
  return { ...serverData, ...predicted }
})
export const queue = signal<QueueData | null>(
  inlineSnapshot?.data.queue ?? null,
)
export const weather = signal<WeatherData | null>(
  inlineSnapshot?.data.weather ?? null,
)
export const agenda = signal<AgendaData | null>(
  inlineSnapshot?.data.agenda ?? null,
)
export const isConnected = signal(false)

/**
 * The server-stamped global clock config (timezone / 12-24h / date style) the
 * clock-bearing views format against. Undefined until the first settings
 * payload — the time helpers apply their own device-local default.
 */
export const clockConfig = computed(
  () => settings.value.clock,
)

/** Ticks each second so the seek bar and ambient clock advance between pushes. */
export const nowMs = signal(Date.now())
setInterval(() => {
  nowMs.value = Date.now()
}, 1_000)

/** While the user drags the seek bar, this overrides the live position. */
export const scrubPositionSeconds = signal<number | null>(
  null,
)

/** The live position: pushed position + elapsed wall-clock while playing. */
export const livePositionSeconds = computed(() => {
  const data = nowPlaying.value
  if (data?.positionSeconds === undefined) {
    return null
  }
  const elapsed =
    data.isPlaying && data.positionUpdatedAtMs !== undefined
      ? (nowMs.value - data.positionUpdatedAtMs) / 1_000
      : 0
  const position = data.positionSeconds + elapsed
  return data.durationSeconds !== undefined
    ? Math.min(position, data.durationSeconds)
    : position
})

/**
 * Whether HA's state agrees with what we predicted. Only the fields a tap
 * actually intended are compared — a pause also freezes the position locally,
 * and HA's position will never match that to the millisecond. An unconfirmed
 * prediction is kept rather than reverted, so a push that raced our command
 * (HA republishing the pre-command state) doesn't flicker the controls back.
 */
const isPredictionConfirmed = ({
  predicted,
  serverData,
}: {
  predicted: Partial<NowPlayingData>
  serverData: NowPlayingData
}) => {
  const isPlayingConfirmed =
    predicted.isPlaying === undefined ||
    predicted.isPlaying === serverData.isPlaying
  const isMutedConfirmed =
    predicted.isMuted === undefined ||
    predicted.isMuted === serverData.isMuted
  const isVolumeConfirmed =
    predicted.volume === undefined ||
    (serverData.volume !== undefined &&
      Math.abs(predicted.volume - serverData.volume) <
        VOLUME_MATCH_EPSILON)
  return (
    isPlayingConfirmed &&
    isMutedConfirmed &&
    isVolumeConfirmed
  )
}

const applyMessage = (message: ServerToClientMessage) => {
  if (message.type === "snapshot") {
    device.value = message.device
    settings.value = message.settings
    activeView.value = message.view
    // A fresh snapshot (first load, or a reconnect) is authoritative.
    clearOptimisticFields()
    nowPlayingFromServer.value =
      message.data.nowPlaying ?? null
    queue.value = message.data.queue ?? null
    weather.value = message.data.weather ?? null
    agenda.value = message.data.agenda ?? null
    return
  }
  if (message.type === "view") {
    activeView.value = message.view
    return
  }
  if (message.type === "now_playing") {
    nowPlayingFromServer.value = message.data
    const predicted = optimisticFields.value
    if (
      predicted &&
      message.data &&
      isPredictionConfirmed({
        predicted,
        serverData: message.data,
      })
    ) {
      clearOptimisticFields()
    }
    return
  }
  if (message.type === "queue") {
    queue.value = message.data
    return
  }
  if (message.type === "settings") {
    settings.value = message.settings
    return
  }
  if (message.type === "weather") {
    weather.value = message.data
    return
  }
  if (message.type === "agenda") {
    agenda.value = message.data
    return
  }
  if (message.type === "reload") {
    window.location.reload()
  }
}

let socket: WebSocket | null = null

export const sendCommand = (command: DeviceCommand) => {
  if (socket?.readyState !== WebSocket.OPEN) {
    return
  }
  const message: ClientToServerMessage = {
    type: "command",
    command,
  }
  socket.send(JSON.stringify(message))
}

/** Toggle play/pause, freezing the seek bar where it stands until HA answers. */
export const togglePlayPause = () => {
  const data = nowPlaying.peek()
  if (data) {
    const frozenPositionSeconds = livePositionSeconds.peek()
    predict({
      isPlaying: !data.isPlaying,
      // Without re-stamping the position, flipping isPlaying would drop the
      // locally-accumulated elapsed time and snap the bar backwards.
      ...(frozenPositionSeconds !== null
        ? {
            positionSeconds: frozenPositionSeconds,
            positionUpdatedAtMs: Date.now(),
          }
        : {}),
    })
  }
  sendCommand({ action: "play_pause" })
}

/**
 * Skip tracks. The next track's metadata is unknowable locally, so there is
 * nothing to predict — just drop any prediction that belonged to the old track.
 */
export const playNext = () => {
  clearOptimisticFields()
  sendCommand({ action: "next" })
}

export const playPrevious = () => {
  clearOptimisticFields()
  sendCommand({ action: "previous" })
}

export const toggleMute = () => {
  const data = nowPlaying.peek()
  if (data?.isMuted !== undefined) {
    predict({ isMuted: !data.isMuted })
  }
  sendCommand({ action: "volume_mute" })
}

/** Jump the seek bar immediately; HA's confirming position lands later. */
export const seekTo = (positionSeconds: number) => {
  predict({
    positionSeconds,
    positionUpdatedAtMs: Date.now(),
  })
  sendCommand({ action: "seek", value: positionSeconds })
}

const volumeSendState: {
  lastSentAtMs: number
  pendingVolume: number | null
  timerId: number | null
} = { lastSentAtMs: 0, pendingVolume: null, timerId: null }

const flushPendingVolume = () => {
  const volume = volumeSendState.pendingVolume
  volumeSendState.pendingVolume = null
  volumeSendState.timerId = null
  if (volume !== null) {
    volumeSendState.lastSentAtMs = Date.now()
    sendCommand({ action: "volume_set", value: volume })
  }
}

/**
 * Move the slider now and publish at most every
 * {@link VOLUME_SEND_INTERVAL_MS} while dragging — a command per pointer event
 * would flood the broker. The trailing timer guarantees the value the finger
 * actually stopped on is the last one sent.
 */
export const setVolume = (volume: number) => {
  predict({ volume })
  const sinceLastSendMs =
    Date.now() - volumeSendState.lastSentAtMs
  if (
    sinceLastSendMs >= VOLUME_SEND_INTERVAL_MS &&
    volumeSendState.timerId === null
  ) {
    volumeSendState.lastSentAtMs = Date.now()
    sendCommand({ action: "volume_set", value: volume })
    return
  }
  volumeSendState.pendingVolume = volume
  if (volumeSendState.timerId === null) {
    volumeSendState.timerId = window.setTimeout(
      flushPendingVolume,
      VOLUME_SEND_INTERVAL_MS - sinceLastSendMs,
    )
  }
}

/** First reconnect delay; doubles per consecutive failure. */
const INITIAL_RETRY_DELAY_MS = 1_000

/** A kiosk must self-heal forever, so the backoff is capped rather than given up on. */
const MAX_RETRY_DELAY_MS = 15_000

/** Tracks the pending reconnect so {@link connect}'s cleanup can cancel it. */
const connection: {
  retryTimerId: number | null
  retryDelayMs: number
  isStopped: boolean
} = {
  retryTimerId: null,
  retryDelayMs: INITIAL_RETRY_DELAY_MS,
  isStopped: false,
}

/**
 * Connect (and keep reconnecting) to this device's WebSocket. Returns a
 * cleanup that closes the socket and cancels any pending retry — a kiosk never
 * calls it, but without it a caller has no way to stop the self-healing
 * reconnect loop, which retries forever by design.
 */
export const connect = () => {
  const deviceId = device.value?.id
  if (!deviceId) {
    return () => {}
  }
  const protocol =
    window.location.protocol === "https:" ? "wss" : "ws"
  const url = `${protocol}://${window.location.host}/d/${deviceId}/ws`
  connection.isStopped = false
  connection.retryDelayMs = INITIAL_RETRY_DELAY_MS

  /**
   * Arm the next attempt. Every failure path routes through here, because a
   * kiosk that stops retrying is a black screen nobody can fix remotely — the
   * HA Reload button rides this same socket, so it cannot recover us.
   * Idempotent: a socket that fires both `onerror` and `onclose` still only
   * schedules one retry.
   */
  const scheduleRetry = () => {
    if (
      connection.isStopped ||
      connection.retryTimerId !== null
    ) {
      return
    }
    const delayMs = connection.retryDelayMs
    connection.retryDelayMs = Math.min(
      delayMs * 2,
      MAX_RETRY_DELAY_MS,
    )
    connection.retryTimerId = window.setTimeout(() => {
      connection.retryTimerId = null
      open()
    }, delayMs)
  }

  const open = () => {
    if (connection.isStopped) {
      return
    }
    try {
      socket = new WebSocket(url)
    } catch {
      // Constructing a socket can throw synchronously (offline, blocked by
      // policy, bad state). Left unhandled this escapes the retry timer's
      // callback and the reconnect loop dies for good.
      scheduleRetry()
      return
    }
    socket.onopen = () => {
      isConnected.value = true
      // Earned a clean connection: start the next outage at 1 s rather than
      // inheriting a capped 15 s delay from an earlier bad patch.
      connection.retryDelayMs = INITIAL_RETRY_DELAY_MS
    }
    socket.onmessage = (event) => {
      try {
        applyMessage(
          JSON.parse(
            String(event.data),
          ) as ServerToClientMessage,
        )
      } catch {
        // Ignore malformed frames.
      }
    }
    socket.onerror = () => {
      // Most engines follow with `onclose`, but not all do when the failure
      // happens during the handshake.
      scheduleRetry()
    }
    socket.onclose = () => {
      isConnected.value = false
      scheduleRetry()
    }
  }

  open()

  return () => {
    connection.isStopped = true
    if (connection.retryTimerId !== null) {
      window.clearTimeout(connection.retryTimerId)
      connection.retryTimerId = null
    }
    socket?.close()
  }
}

/**
 * Re-seed every signal from the page shell and drop all in-flight timers.
 *
 * Exported for tests only. A browser's ESM registry is immutable — a module
 * can't be un-imported — so `vi.resetModules()` hands a test the *same*
 * instance of this module and its signals leak between cases. Mirrors
 * `__resetTaskSchedulerForTests` in the mux-magic tools package.
 */
export const __resetStateForTests = () => {
  clearOptimisticFields()
  if (volumeSendState.timerId !== null) {
    window.clearTimeout(volumeSendState.timerId)
  }
  volumeSendState.lastSentAtMs = 0
  volumeSendState.pendingVolume = null
  volumeSendState.timerId = null
  if (connection.retryTimerId !== null) {
    window.clearTimeout(connection.retryTimerId)
  }
  connection.retryTimerId = null
  connection.retryDelayMs = INITIAL_RETRY_DELAY_MS
  connection.isStopped = false

  const snapshot = readInlineSnapshot()
  device.value = snapshot?.device ?? null
  settings.value = snapshot?.settings ?? DEFAULT_SETTINGS
  activeView.value = snapshot?.view ?? "now-playing"
  nowPlayingFromServer.value =
    snapshot?.data.nowPlaying ?? null
  queue.value = snapshot?.data.queue ?? null
  weather.value = snapshot?.data.weather ?? null
  agenda.value = snapshot?.data.agenda ?? null
  scrubPositionSeconds.value = null
  isConnected.value = false
}
