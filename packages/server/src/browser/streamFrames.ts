import { createHash } from "node:crypto"
import type { ServerToClientMessage } from "@castkit/shared/protocol/ws"
import {
  getHasRemainingAgenda,
  listSwipeDestinations,
} from "@castkit/shared/views/swipeDestinations"

type DeviceSnapshot = Extract<
  ServerToClientMessage,
  { type: "snapshot" }
>

type DisplayTarget = {
  kind: "view" | "screen"
  id: string
}

/**
 * The image-stream worker's own touch-target script, verbatim
 * (`TARGETS_SCRIPT` in `device-client/remote-display/worker.py`). A test holds
 * the two equal: targets read any other way would not belong to the pixels the
 * worker shows, and a tap could select a different control.
 */
export const STREAM_TARGETS_SCRIPT = `({attribute, loadingSelector, width = 480, height = 320}) => {
const stage = document.querySelector('.stage');
const gestures = stage ? [{identity: \`view-gesture:\${stage.dataset.view}\`,x:0,y:0,width,height,loading:false}] : [];
return gestures.concat(Array.from(document.querySelectorAll(\`[\${attribute}]\`)).filter(element => {
  if (element.closest('[inert],[aria-hidden="true"]')) return false;
  const bounds = element.getBoundingClientRect();
  return bounds.width && bounds.height && bounds.left >= 0 && bounds.top >= 0 && bounds.right <= width && bounds.bottom <= height && !element.matches(':disabled,[aria-disabled="true"]');
}).map(element => { const bounds = element.getBoundingClientRect(); return {
  identity: element.getAttribute(attribute), x: bounds.x, y: bounds.y,
  width: bounds.width, height: bounds.height, loading: loadingSelector ? element.matches(loadingSelector) : false
}; })); }`

/** One touch target, exactly as the worker's script reports it. */
export type StreamTarget = {
  identity: string
  x: number
  y: number
  width: number
  height: number
  // The worker's own wire name (`TARGETS_SCRIPT`), passed through unchanged.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  loading: boolean
}

/** A destination drawn ahead: the PNG the worker would capture, and its targets. */
export type StreamFrame = {
  key: string
  viewId: string
  png: Buffer
  targets: readonly StreamTarget[]
}

/** One view a swipe can reach, with what its pixels are drawn from. */
export type StreamDestination = {
  viewId: string
  /** Everything that changes the destination's pixels, as one string. */
  content: string
  /** The snapshot a capture page renders this destination from. */
  snapshot: DeviceSnapshot
  /** The platform channels a composed destination draws from. */
  channelIds?: readonly string[]
}

/** A panel holds six frames ahead; the slots on the board are numbered 0–5. */
export const STREAM_FRAME_LIMIT = 6

/**
 * Native views whose pixels change with the minute: a clock, or a printer's
 * time remaining. Their content carries the minute, so they are drawn again
 * once a minute. Now Playing is not one of them: its progress bar is drawn
 * from the time the frame was taken, and the live capture corrects those few
 * pixels after the swipe.
 */
const MINUTE_VIEW_IDS = new Set([
  "calendar",
  "ambient",
  "printer-status",
  "print-queue",
])

/**
 * The data a clock view draws from. Every other room's music, queue and
 * printers are in the same snapshot but never reach these views' pixels, so
 * leaving them out lets panels playing different music share one clock frame
 * and keeps a track change from drawing the clock again. A view not listed
 * here keys on all of the snapshot's data.
 */
const VIEW_DATA_KEYS: Partial<
  Record<string, (keyof DeviceSnapshot["data"])[]>
> = {
  ambient: ["weather"],
  calendar: ["agenda", "weather"],
}

/**
 * The snapshot as a key: what draws the panel, without what names it.
 *
 * The device id, label and preload list draw nothing, and Now Playing's
 * position moves every second while music plays. The id is also cut out of
 * every URL that carries it (a device's artwork route), so two panels with the
 * same properties and the same data get one key and share one render.
 */
const readSnapshotContent = (snapshot: DeviceSnapshot) => {
  const {
    id: deviceId,
    label: _label,
    preloadViewIds: _preloadViewIds,
    ...device
  } = snapshot.device
  const nowPlaying = snapshot.data.nowPlaying
  const {
    positionSeconds: _positionSeconds,
    positionUpdatedAtMs: _positionUpdatedAtMs,
    ...stillNowPlaying
  } = nowPlaying ?? {}
  const dataKeys = VIEW_DATA_KEYS[snapshot.view]
  const data = dataKeys
    ? Object.fromEntries(
        dataKeys.map((key) => [
          key,
          snapshot.data[key] ?? null,
        ]),
      )
    : {
        ...snapshot.data,
        ...(nowPlaying
          ? { nowPlaying: stillNowPlaying }
          : {}),
      }
  return JSON.stringify({
    device,
    settings: snapshot.settings,
    view: snapshot.view,
    displayTarget: snapshot.displayTarget
      ? {
          kind: snapshot.displayTarget.kind,
          id: snapshot.displayTarget.id,
        }
      : null,
    data: snapshot.displayTarget ? null : data,
    buildId: snapshot.buildId,
  })
    .split(deviceId)
    .join("\u0000device")
}

/**
 * Every swipe destination of a panel, from its current snapshot.
 *
 * A native view renders from the same snapshot with only the view changed. A
 * left-swipe view the house resolves (a composed view such as Kids Points) is
 * drawn only once this panel's earlier request showed which target the house
 * chose for it (`readLearnedTarget`), and only when the platform can say what
 * that target's pixels depend on (`readPlatformContent`).
 */
export const readStreamDestinations = ({
  snapshot,
  nowMs,
  readLearnedTarget,
  readPlatformContent,
}: {
  snapshot: DeviceSnapshot
  nowMs: number
  readLearnedTarget: (
    requested: string,
  ) => DisplayTarget | undefined
  readPlatformContent: (target: DisplayTarget) =>
    | {
        content: string
        isTimeDriven: boolean
        channelIds: readonly string[]
      }
    | undefined
}): StreamDestination[] => {
  const minute = Math.floor(nowMs / 60_000)
  const viewIds = listSwipeDestinations({
    currentView: snapshot.view,
    hasAgenda: getHasRemainingAgenda({
      events: snapshot.data.agenda?.events ?? [],
      nowMs,
    }),
    device: snapshot.device,
    limit: STREAM_FRAME_LIMIT,
  })
  return viewIds.flatMap((viewId): StreamDestination[] => {
    if (
      snapshot.device.views.some(
        (view) => view.clientId === viewId,
      )
    ) {
      const destination = {
        ...snapshot,
        view: viewId,
        displayTarget: null,
      }
      return [
        {
          viewId,
          snapshot: destination,
          content: JSON.stringify({
            snapshot: readSnapshotContent(destination),
            minute: MINUTE_VIEW_IDS.has(viewId)
              ? minute
              : null,
          }),
        },
      ]
    }
    const target = readLearnedTarget(viewId)
    const platform = target
      ? readPlatformContent(target)
      : undefined
    if (!target || !platform) {
      return []
    }
    const destination = {
      ...snapshot,
      displayTarget: target,
    }
    return [
      {
        viewId,
        snapshot: destination,
        channelIds: platform.channelIds,
        content: JSON.stringify({
          snapshot: readSnapshotContent(destination),
          platform: platform.content,
          minute: platform.isTimeDriven ? minute : null,
        }),
      },
    ]
  })
}

/** The frames a worker can fetch now, and a tag that changes with them. */
export type StreamFrameIndex = {
  tag: string
  frames: readonly { view: string; key: string }[]
}

const hashText = (text: string) =>
  createHash("sha256")
    .update(text)
    .digest("hex")
    .slice(0, 24)

const EMPTY_INDEX: StreamFrameIndex = {
  tag: hashText("[]"),
  frames: [],
}

type Entry = {
  /** Absent while the frame is queued or rendering. */
  frame?: StreamFrame
}

type DeviceState = {
  /** View id → key, nearest destination first. */
  keys: Map<string, string>
  destinations: Map<string, StreamDestination>
  index: StreamFrameIndex
  subscribedAt: number
  waiters: Set<() => void>
}

/**
 * Each image-stream panel's swipe destinations, drawn ahead into memory so the
 * worker can show one the moment a swipe is released
 * (docs/2026-10-23-shared-frame-cache-plan.md, phase 2).
 *
 * - **Keyed and shared.** A frame is addressed by a hash of everything that
 *   draws it (`readStreamDestinations`). Panels whose keys match share one
 *   render and one buffer.
 * - **Drawn only for a listening worker.** A panel's destinations are kept
 *   only while its worker asks for them (`subscribe`); a panel whose worker
 *   cannot use them, or has stopped asking, costs nothing.
 * - **Drawn again only when a key changes**: on a change the browser hub
 *   reports, on a platform channel change, and on the minute for the views
 *   that show it. Nothing polls.
 * - **Bounded, in memory only.** An entry lives while some listening panel's
 *   destination names its key: at most six per panel. Renders run one at a
 *   time. Nothing is written to disk.
 */
export const createStreamFrameCache = ({
  readDestinations,
  capture,
  now = Date.now,
  subscriptionMilliseconds = 90_000,
  debounceMilliseconds = 150,
  retryMilliseconds = 60_000,
  onRendered,
  onFailed,
}: {
  readDestinations: (
    deviceId: string,
    nowMs: number,
  ) => StreamDestination[] | undefined
  capture: (request: {
    deviceId: string
    destination: StreamDestination
  }) => Promise<{
    png: Buffer
    targets: readonly StreamTarget[]
  }>
  now?: () => number
  subscriptionMilliseconds?: number
  debounceMilliseconds?: number
  retryMilliseconds?: number
  onRendered?: (event: {
    deviceId: string
    viewId: string
    milliseconds: number
    bytes: number
  }) => void
  onFailed?: (event: {
    deviceId: string
    viewId: string
    error: unknown
  }) => void
}) => {
  const entries = new Map<string, Entry>()
  const devices = new Map<string, DeviceState>()
  const failedAt = new Map<string, number>()
  // Keys waiting for a render, oldest first. A key, not a panel: two panels
  // that share a key queue one render.
  const queue = new Set<string>()
  const timers: {
    minute: ReturnType<typeof setTimeout> | null
    debounce: Map<string, ReturnType<typeof setTimeout>>
  } = { minute: null, debounce: new Map() }
  const state = { isPumping: false, isDisposed: false }

  const findOwner = (key: string) =>
    Array.from(devices.entries()).flatMap(
      ([deviceId, device]) =>
        Array.from(device.keys.entries())
          .filter(([, deviceKey]) => deviceKey === key)
          .map(([viewId]) => ({
            deviceId,
            destination: device.destinations.get(viewId),
          })),
    )[0]

  const getIsReferenced = (key: string) =>
    findOwner(key) !== undefined

  const releaseUnreferenced = () => {
    Array.from(entries.keys()).forEach((key) => {
      if (!getIsReferenced(key)) {
        entries.delete(key)
      }
    })
    Array.from(failedAt.keys()).forEach((key) => {
      if (!getIsReferenced(key)) {
        failedAt.delete(key)
      }
    })
  }

  const updateIndex = (deviceId: string) => {
    const device = devices.get(deviceId)
    if (!device) {
      return
    }
    const frames = Array.from(device.keys.entries())
      .filter(([, key]) => entries.get(key)?.frame)
      .map(([view, key]) => ({ view, key }))
    const tag = hashText(JSON.stringify(frames))
    if (tag === device.index.tag) {
      return
    }
    device.index = { tag, frames }
    const waiters = Array.from(device.waiters)
    device.waiters.clear()
    waiters.forEach((wake) => {
      wake()
    })
  }

  const updateIndexesFor = (key: string) => {
    devices.forEach((device, deviceId) => {
      if (Array.from(device.keys.values()).includes(key)) {
        updateIndex(deviceId)
      }
    })
  }

  const renderNext = async (): Promise<void> => {
    const [key] = queue
    if (key === undefined || state.isDisposed) {
      return
    }
    queue.delete(key)
    const entry = entries.get(key)
    const owner = findOwner(key)
    if (!entry || entry.frame || !owner?.destination) {
      if (entry && !entry.frame) {
        entries.delete(key)
      }
      return renderNext()
    }
    const { deviceId, destination } = owner
    const startedAt = now()
    try {
      const { png, targets } = await capture({
        deviceId,
        destination,
      })
      // Released while it rendered: no panel shows this key any more.
      if (entries.get(key) === entry) {
        entry.frame = {
          key,
          viewId: destination.viewId,
          png,
          targets,
        }
        failedAt.delete(key)
        updateIndexesFor(key)
      }
      onRendered?.({
        deviceId,
        viewId: destination.viewId,
        milliseconds: now() - startedAt,
        bytes: png.length,
      })
    } catch (error) {
      if (entries.get(key) === entry) {
        entries.delete(key)
      }
      failedAt.set(key, now())
      onFailed?.({
        deviceId,
        viewId: destination.viewId,
        error,
      })
    }
    return renderNext()
  }

  /** Renders run one at a time: each is a whole browser page. */
  const pump = async () => {
    if (state.isPumping) {
      return
    }
    state.isPumping = true
    try {
      await renderNext()
    } finally {
      state.isPumping = false
    }
  }

  const refresh = (deviceId: string) => {
    const device = devices.get(deviceId)
    if (!device || state.isDisposed) {
      return
    }
    const destinations =
      readDestinations(deviceId, now()) ?? []
    device.destinations = new Map(
      destinations.map((destination) => [
        destination.viewId,
        destination,
      ]),
    )
    device.keys = new Map(
      destinations.map((destination) => [
        destination.viewId,
        hashText(destination.content),
      ]),
    )
    releaseUnreferenced()
    device.keys.forEach((key) => {
      const failure = failedAt.get(key)
      if (
        entries.has(key) ||
        (failure !== undefined &&
          now() - failure < retryMilliseconds)
      ) {
        return
      }
      entries.set(key, {})
      queue.add(key)
    })
    updateIndex(deviceId)
    void pump()
  }

  const forgetIdleDevices = () => {
    devices.forEach((device, deviceId) => {
      if (
        device.waiters.size === 0 &&
        now() - device.subscribedAt >
          subscriptionMilliseconds
      ) {
        devices.delete(deviceId)
      }
    })
    releaseUnreferenced()
  }

  const scheduleMinute = () => {
    if (
      timers.minute ||
      devices.size === 0 ||
      state.isDisposed
    ) {
      return
    }
    const untilNextMinute = 60_000 - (now() % 60_000) + 50
    timers.minute = setTimeout(() => {
      timers.minute = null
      forgetIdleDevices()
      Array.from(devices.keys()).forEach(refresh)
      scheduleMinute()
    }, untilNextMinute)
    timers.minute.unref?.()
  }

  /** Recompute a panel's keys soon; a burst of changes recomputes once. */
  const markChanged = (deviceId: string) => {
    if (
      !devices.has(deviceId) ||
      timers.debounce.has(deviceId)
    ) {
      return
    }
    const timer = setTimeout(() => {
      timers.debounce.delete(deviceId)
      refresh(deviceId)
    }, debounceMilliseconds)
    timer.unref?.()
    timers.debounce.set(deviceId, timer)
  }

  /** A worker is listening for this panel: keep its destinations drawn. */
  const subscribe = (deviceId: string) => {
    const device = devices.get(deviceId)
    if (device) {
      device.subscribedAt = now()
      return
    }
    devices.set(deviceId, {
      keys: new Map(),
      destinations: new Map(),
      index: EMPTY_INDEX,
      subscribedAt: now(),
      waiters: new Set(),
    })
    refresh(deviceId)
    scheduleMinute()
  }

  return {
    subscribe,
    markChanged,
    /** Recompute the keys of every panel with a destination on `channelId`. */
    markChannelChanged: (channelId: string) => {
      devices.forEach((device, deviceId) => {
        if (
          Array.from(device.destinations.values()).some(
            (destination) =>
              destination.channelIds?.includes(channelId),
          )
        ) {
          markChanged(deviceId)
        }
      })
    },
    readIndex: (deviceId: string) =>
      devices.get(deviceId)?.index ?? EMPTY_INDEX,
    /**
     * The panel's index once its tag differs from `after`, or after
     * `timeoutMilliseconds` either way. A worker holds one of these open, so
     * it hears about a new frame at once and asks nothing in between.
     */
    waitForIndex: async ({
      deviceId,
      after,
      timeoutMilliseconds,
      signal,
    }: {
      deviceId: string
      after: string | undefined
      timeoutMilliseconds: number
      signal?: AbortSignal
    }) => {
      subscribe(deviceId)
      const device = devices.get(deviceId)
      if (!device || device.index.tag !== after) {
        return device?.index ?? EMPTY_INDEX
      }
      await new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(timer)
          device.waiters.delete(finish)
          signal?.removeEventListener("abort", finish)
          resolve()
        }
        const timer = setTimeout(
          finish,
          timeoutMilliseconds,
        )
        timer.unref?.()
        device.waiters.add(finish)
        signal?.addEventListener("abort", finish)
      })
      device.subscribedAt = now()
      return device.index
    },
    /** The panel's current frame of `viewId`, if it has been drawn. */
    read: (deviceId: string, viewId: string) => {
      const key = devices.get(deviceId)?.keys.get(viewId)
      return key ? entries.get(key)?.frame : undefined
    },
    getStats: () => ({
      devices: devices.size,
      entries: entries.size,
      bytes: Array.from(entries.values()).reduce(
        (total, entry) =>
          total + (entry.frame?.png.length ?? 0),
        0,
      ),
      queued: queue.size,
    }),
    dispose: () => {
      state.isDisposed = true
      if (timers.minute) {
        clearTimeout(timers.minute)
      }
      timers.debounce.forEach((timer) => {
        clearTimeout(timer)
      })
      timers.debounce.clear()
      devices.forEach((device) => {
        Array.from(device.waiters).forEach((wake) => {
          wake()
        })
      })
      devices.clear()
      entries.clear()
      queue.clear()
    },
  }
}

/** The in-memory cache of image-stream swipe destinations. */
export type StreamFrameCache = ReturnType<
  typeof createStreamFrameCache
>
