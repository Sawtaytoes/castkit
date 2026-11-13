import { afterEach, expect, test, vi } from "vitest"
import {
  ARTWORK_FETCH_TIMEOUT_MILLISECONDS,
  ARTWORK_MAX_BYTES,
  createLatestRequestTracker,
  fetchArtworkDataUri,
} from "./artworkFetch.ts"

afterEach(() => {
  vi.restoreAllMocks()
})

const silenceErrors = () =>
  vi.spyOn(console, "error").mockImplementation(() => {})

/** A body that arrives in chunks and has no content-length header. */
const buildChunkedResponse = (chunks: Uint8Array[]) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start: (controller) => {
        chunks.forEach((chunk) => {
          controller.enqueue(chunk)
        })
        controller.close()
      },
    }),
    { headers: { "content-type": "image/png" } },
  )

test("small artwork becomes a data URI", async () => {
  const dataUri = await fetchArtworkDataUri({
    url: "http://art.example/small.png",
    fetchImage: async () =>
      buildChunkedResponse([
        new Uint8Array([1, 2]),
        new Uint8Array([3]),
      ]),
  })
  expect(dataUri).toBe("data:image/png;base64,AQID")
})

test("the download carries the artwork timeout", async () => {
  const timeoutSpy = vi.spyOn(AbortSignal, "timeout")
  const fetchImage = vi.fn(
    async (
      _url: string | URL | Request,
      _init?: RequestInit,
    ) => buildChunkedResponse([new Uint8Array([1])]),
  )
  await fetchArtworkDataUri({
    url: "http://art.example/timed.png",
    fetchImage: fetchImage as unknown as typeof fetch,
  })
  expect(timeoutSpy).toHaveBeenCalledWith(
    ARTWORK_FETCH_TIMEOUT_MILLISECONDS,
  )
  expect(
    fetchImage.mock.calls[0]?.[1]?.signal,
  ).toBeInstanceOf(AbortSignal)
})

test("a download that times out gives no artwork instead of hanging", async () => {
  silenceErrors()
  vi.spyOn(AbortSignal, "timeout").mockImplementation(() =>
    AbortSignal.abort(),
  )
  const dataUri = await fetchArtworkDataUri({
    url: "http://art.example/stalled.png",
    fetchImage: ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        if (init?.signal?.aborted) {
          reject(init.signal.reason)
        }
        init?.signal?.addEventListener("abort", () => {
          reject(init.signal?.reason)
        })
      })) as unknown as typeof fetch,
  })
  expect(dataUri).toBeUndefined()
})

test("artwork that declares a size over the limit is skipped unread", async () => {
  silenceErrors()
  const cancel = vi.fn()
  const response = new Response(
    new ReadableStream({ cancel }),
    {
      headers: {
        "content-type": "image/jpeg",
        "content-length": String(ARTWORK_MAX_BYTES + 1),
      },
    },
  )
  const dataUri = await fetchArtworkDataUri({
    url: "http://art.example/declared-huge.jpg",
    fetchImage: async () => response,
  })
  expect(dataUri).toBeUndefined()
  expect(cancel).toHaveBeenCalled()
})

test("artwork that streams past the limit is cut off", async () => {
  silenceErrors()
  const half = new Uint8Array(ARTWORK_MAX_BYTES / 2)
  const dataUri = await fetchArtworkDataUri({
    url: "http://art.example/streamed-huge.jpg",
    fetchImage: async () =>
      buildChunkedResponse([half, half, new Uint8Array(1)]),
  })
  expect(dataUri).toBeUndefined()
})

test("artwork exactly at the limit is kept", async () => {
  const half = new Uint8Array(ARTWORK_MAX_BYTES / 2)
  const dataUri = await fetchArtworkDataUri({
    url: "http://art.example/at-limit.jpg",
    fetchImage: async () =>
      buildChunkedResponse([half, half]),
  })
  expect(
    dataUri?.startsWith("data:image/png;base64,"),
  ).toBe(true)
})

test("a newer request for the same display makes the older one stale", () => {
  const tracker = createLatestRequestTracker()
  const older = tracker.begin("display-a")
  const otherDisplay = tracker.begin("display-b")
  const newer = tracker.begin("display-a")
  expect(older.getIsLatest()).toBe(false)
  expect(newer.getIsLatest()).toBe(true)
  expect(otherDisplay.getIsLatest()).toBe(true)
})

test("a slow older download cannot replace newer now-playing art", async () => {
  const tracker = createLatestRequestTracker()
  const applied: string[] = []
  const pending = new Map<
    string,
    (response: Response) => void
  >()
  const fetchImage = ((url: string) =>
    new Promise<Response>((resolve) => {
      pending.set(url, resolve)
    })) as unknown as typeof fetch
  const apply = async (url: string) => {
    const request = tracker.begin("display-a")
    const dataUri = await fetchArtworkDataUri({
      url,
      fetchImage,
    })
    if (request.getIsLatest() && dataUri) {
      applied.push(dataUri)
    }
  }
  const olderTrack = apply(
    "http://art.example/older-track.png",
  )
  const newerTrack = apply(
    "http://art.example/newer-track.png",
  )
  pending.get("http://art.example/newer-track.png")?.(
    buildChunkedResponse([new Uint8Array([2])]),
  )
  await newerTrack
  pending.get("http://art.example/older-track.png")?.(
    buildChunkedResponse([new Uint8Array([1])]),
  )
  await olderTrack
  expect(applied).toEqual(["data:image/png;base64,Ag=="])
})
