/**
 * Release decoded camera pictures at the pace the camera took them.
 *
 * Home Assistant publishes its low-latency stream in parts of about a second,
 * so ffmpeg decodes a second of pictures at once and then nothing. A panel that
 * always takes the newest picture would show one moment per part. Each picture
 * is held until `bufferMilliseconds` after the earliest moment it could have
 * arrived — the smallest arrival delay seen in the recent window — which spreads
 * a part's pictures across the time it covers. A picture already due when a
 * newer one is due too is skipped: the newest due picture always wins.
 */
export const createFramePacer = <Picture>({
  bufferMilliseconds = 1000,
  windowMilliseconds = 20_000,
  maximumQueued = 60,
  now = Date.now,
  onRelease,
}: {
  bufferMilliseconds?: number
  windowMilliseconds?: number
  maximumQueued?: number
  now?: () => number
  onRelease: (picture: Picture) => void
}) => {
  const state = {
    delays: [] as { at: number; delay: number }[],
    queue: [] as {
      picture: Picture
      media: number
      releaseAt: number
    }[],
    timer: undefined as
      | ReturnType<typeof setTimeout>
      | undefined,
    isDisposed: false,
  }
  const release = () => {
    state.timer = undefined
    if (state.isDisposed) return
    const current = now()
    const newest = state.queue
      .filter((item) => item.releaseAt <= current)
      .reduce<(typeof state.queue)[number] | undefined>(
        (latest, item) =>
          !latest || item.media > latest.media
            ? item
            : latest,
        undefined,
      )
    // Nothing older than a picture on the glass may follow it.
    state.queue = state.queue.filter(
      (item) =>
        item.releaseAt > current &&
        (!newest || item.media > newest.media),
    )
    if (newest) onRelease(newest.picture)
    if (state.queue.length > 0)
      state.timer = setTimeout(
        release,
        Math.max(
          0,
          Math.min(
            ...state.queue.map((item) => item.releaseAt),
          ) - current,
        ),
      )
  }
  return {
    /** Queue one picture taken `mediaMilliseconds` into the stream. */
    push: (picture: Picture, mediaMilliseconds: number) => {
      if (state.isDisposed) return
      const current = now()
      state.delays = state.delays
        .filter(
          (item) => current - item.at <= windowMilliseconds,
        )
        .concat({
          at: current,
          delay: current - mediaMilliseconds,
        })
      const smallestDelay = Math.min(
        ...state.delays.map((item) => item.delay),
      )
      state.queue = state.queue
        .concat({
          picture,
          media: mediaMilliseconds,
          releaseAt:
            mediaMilliseconds +
            smallestDelay +
            bufferMilliseconds,
        })
        .slice(-maximumQueued)
      // A timer, even a zero one, lets a burst decoded in one read collapse
      // into its newest due picture.
      if (state.timer) clearTimeout(state.timer)
      state.timer = setTimeout(
        release,
        Math.max(
          0,
          Math.min(
            ...state.queue.map((item) => item.releaseAt),
          ) - current,
        ),
      )
    },
    dispose: () => {
      state.isDisposed = true
      if (state.timer) clearTimeout(state.timer)
      state.queue = []
    },
  }
}
