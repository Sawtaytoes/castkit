import type {
  ChannelSnapshot,
  ContractData,
} from "@castkit/sdk/contracts"

/** How long a paused track still counts as something going on. */
export const PAUSED_ACTIVE_SECONDS = 600

/**
 * How long a track must play before its stop starts the paused window.
 *
 * A spoken announcement on the same speaker reads as a second or three of
 * playback. Without this floor every announcement would end a "spell" and
 * restart the ten minutes, so an idle room would keep its music panel for
 * as long as announcements keep coming. Real listening is minutes long, so
 * thirty seconds separates the two with room to spare.
 */
export const MINIMUM_PLAY_SECONDS = 30

type Memory = {
  playingSinceMs?: number
  stoppedAtMs?: number
}

/**
 * When each now-playing channel last really stopped playing.
 *
 * A pause must not hide the music at once: the owner keeps the paused track
 * on the glass so it can be resumed from there, and only gives the room back
 * after ten minutes of quiet. A pause cannot be read from one snapshot,
 * because a Music Assistant sync group turns a pause into a stop and the
 * payload says only `isPlaying: false`. So the stop is timed here, from the
 * transitions the hub already sees.
 *
 * Kept in memory on purpose. After a restart nothing is known about the
 * last stop, and the panel reads as idle until the music plays again: an
 * idle room that stays idle is the safe mistake.
 */
export const createPausedMusic = ({
  now = Date.now,
  onExpire,
}: {
  now?: () => number
  onExpire?: () => void
} = {}) => {
  const memories = new Map<string, Memory>()
  const timers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >()

  const scheduleExpiry = (
    channelId: string,
    atMs: number,
  ) => {
    clearTimeout(timers.get(channelId))
    const timer = setTimeout(
      () => {
        timers.delete(channelId)
        onExpire?.()
      },
      Math.max(0, atMs - now()),
    )
    timer.unref?.()
    timers.set(channelId, timer)
  }

  const observe = (snapshot: ChannelSnapshot) => {
    if (
      snapshot.type !== "now-playing.v1" ||
      !snapshot.data
    )
      return
    const { isPlaying } =
      snapshot.data as ContractData["now-playing.v1"]
    const memory = memories.get(snapshot.id) ?? {}
    if (isPlaying) {
      if (memory.playingSinceMs === undefined)
        memories.set(snapshot.id, {
          ...memory,
          playingSinceMs: now(),
        })
      return
    }
    if (memory.playingSinceMs === undefined) return
    const hasPlayedForReal =
      now() - memory.playingSinceMs >=
      MINIMUM_PLAY_SECONDS * 1000
    const stoppedAtMs = hasPlayedForReal
      ? now()
      : memory.stoppedAtMs
    memories.set(snapshot.id, { stoppedAtMs })
    if (hasPlayedForReal)
      scheduleExpiry(
        snapshot.id,
        now() + PAUSED_ACTIVE_SECONDS * 1000,
      )
  }

  /** True while the channel's last real stop is less than ten minutes old. */
  const isRecentlyPaused = (channelId: string) => {
    const stoppedAtMs = memories.get(channelId)?.stoppedAtMs
    return (
      stoppedAtMs !== undefined &&
      now() - stoppedAtMs < PAUSED_ACTIVE_SECONDS * 1000
    )
  }

  return {
    observe,
    isRecentlyPaused,
    dispose: () => {
      timers.forEach((timer) => {
        clearTimeout(timer)
      })
      timers.clear()
      memories.clear()
    },
  }
}

export type PausedMusic = ReturnType<
  typeof createPausedMusic
>
