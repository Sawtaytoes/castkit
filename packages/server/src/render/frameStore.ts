type FrameEntry = {
  image?: Buffer
  promise?: Promise<Buffer | null>
}

/** Where a frame handed to a display came from. */
export type FrameSource = "cached" | "joined" | "rendered"

/**
 * Rendered frames held in memory, addressed by the KEY they were rendered
 * from, with an index of which key each display shows now.
 *
 * A key holds everything that changes a frame's pixels and nothing else, so
 * two displays whose keys match get the same picture: they share one render
 * (a second asker joins the render already running) and one Buffer.
 *
 * Bound: an entry lives only while some display's current key names it. When
 * the last display moves to another key, the old entry goes, and a render
 * still running for it stores nothing. The store therefore never holds more
 * entries than there are displays, plus renders in flight. Nothing is written
 * to disk; a restart costs one render per key.
 */
export const createFrameStore = () => {
  const entries = new Map<string, FrameEntry>()
  const keyByDevice = new Map<string, string>()

  const getIsReferenced = (key: string) =>
    Array.from(keyByDevice.values()).includes(key)

  const release = (key: string | undefined) => {
    if (key !== undefined && !getIsReferenced(key)) {
      entries.delete(key)
    }
  }

  /** Point the display at `key`, releasing the key it showed before. */
  const link = ({
    deviceId,
    key,
  }: {
    deviceId: string
    key: string
  }) => {
    const previousKey = keyByDevice.get(deviceId)
    keyByDevice.set(deviceId, key)
    if (previousKey !== key) {
      release(previousKey)
    }
    return entries.has(key)
  }

  const startRender = ({
    key,
    renderFrame,
  }: {
    key: string
    renderFrame: () => Promise<Buffer | null>
  }) => {
    const entry: FrameEntry = {}
    const promise = renderFrame().then((image) => {
      // Released while it ran: no display shows this key any more.
      if (entries.get(key) === entry) {
        if (image) {
          entries.set(key, { image })
        } else {
          entries.delete(key)
        }
      }
      return image
    })
    promise.catch(() => {
      if (entries.get(key) === entry) {
        entries.delete(key)
      }
    })
    entry.promise = promise
    entries.set(key, entry)
    return promise
  }

  /** The frame for `key`: from memory, from the render already running, or rendered now. */
  const read = async ({
    deviceId,
    key,
    renderFrame,
  }: {
    deviceId: string
    key: string
    renderFrame: () => Promise<Buffer | null>
  }): Promise<{
    image: Buffer | null
    source: FrameSource
  }> => {
    link({ deviceId, key })
    const entry = entries.get(key)
    if (entry?.image) {
      return { image: entry.image, source: "cached" }
    }
    if (entry?.promise) {
      return {
        image: await entry.promise,
        source: "joined",
      }
    }
    return {
      image: await startRender({ key, renderFrame }),
      source: "rendered",
    }
  }

  return {
    read,
    link,
    /** Render ahead for `key` unless that frame is already held or running. */
    prepare: async (request: {
      deviceId: string
      key: string
      renderFrame: () => Promise<Buffer | null>
    }) => Boolean((await read(request)).image),
    /** Whether a frame for `key` is held or already being rendered. */
    getHasFrame: (key: string) => entries.has(key),
    /** Drop the display from the index; its entry goes if nobody else shows it. */
    forget: (deviceId: string) => {
      const previousKey = keyByDevice.get(deviceId)
      keyByDevice.delete(deviceId)
      release(previousKey)
    },
    getSize: () => entries.size,
  }
}

/** The in-memory, key-addressed frame store a push controller renders through. */
export type FrameStore = ReturnType<typeof createFrameStore>
