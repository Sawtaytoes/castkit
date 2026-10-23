type CachedFrame = {
  key: string
  image: Buffer
}

type PendingFrame = {
  key: string
  promise: Promise<Buffer | null>
}

/** Where a frame handed to a requesting display came from. */
export type FrameSource = "cached" | "joined" | "rendered"

/**
 * The latest rendered frame of each `renderOn: "request"` display, held in
 * memory and keyed by everything the frame was rendered from.
 *
 * A watch that asks for its image is answered from the buffer when the key
 * still matches, joins a render already running for the same key, and only
 * otherwise starts a render of its own. One entry per display, plain Buffers,
 * nothing on disk: a restart costs one render on the first request.
 */
export const createRequestFrameCache = () => {
  const cachedFrames = new Map<string, CachedFrame>()
  const pendingFrames = new Map<string, PendingFrame>()

  const startRender = ({
    deviceId,
    key,
    renderFrame,
  }: {
    deviceId: string
    key: string
    renderFrame: () => Promise<Buffer | null>
  }) => {
    const promise = renderFrame().then((image) => {
      // A newer render (or a forget) replaced this one while it ran, so its
      // frame describes a state nobody asked for any more.
      if (
        image &&
        pendingFrames.get(deviceId)?.promise === promise
      ) {
        cachedFrames.set(deviceId, { key, image })
      }
      return image
    })
    const settle = () => {
      if (
        pendingFrames.get(deviceId)?.promise === promise
      ) {
        pendingFrames.delete(deviceId)
      }
    }
    promise.then(settle, settle)
    pendingFrames.set(deviceId, { key, promise })
    return promise
  }

  /** Render ahead for `key` unless that frame is already held or running. */
  const prepare = ({
    deviceId,
    key,
    renderFrame,
  }: {
    deviceId: string
    key: string
    renderFrame: () => Promise<Buffer | null>
  }) => {
    if (cachedFrames.get(deviceId)?.key === key) {
      return Promise.resolve(true)
    }
    const pending = pendingFrames.get(deviceId)
    if (pending?.key === key) {
      return pending.promise.then(Boolean)
    }
    return startRender({ deviceId, key, renderFrame }).then(
      Boolean,
    )
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
    const cached = cachedFrames.get(deviceId)
    if (cached?.key === key) {
      return { image: cached.image, source: "cached" }
    }
    const pending = pendingFrames.get(deviceId)
    if (pending?.key === key) {
      return {
        image: await pending.promise,
        source: "joined",
      }
    }
    return {
      image: await startRender({
        deviceId,
        key,
        renderFrame,
      }),
      source: "rendered",
    }
  }

  return {
    prepare,
    read,
    /** Whether a frame for `key` is held or already being rendered. */
    getHasFrame: ({
      deviceId,
      key,
    }: {
      deviceId: string
      key: string
    }) =>
      cachedFrames.get(deviceId)?.key === key ||
      pendingFrames.get(deviceId)?.key === key,
    /** Drop the display's frame; an in-flight render then stores nothing. */
    forget: (deviceId: string) => {
      cachedFrames.delete(deviceId)
      pendingFrames.delete(deviceId)
    },
    getSize: () => cachedFrames.size,
  }
}

/** The in-memory frame store a push controller answers requesting displays from. */
export type RequestFrameCache = ReturnType<
  typeof createRequestFrameCache
>
