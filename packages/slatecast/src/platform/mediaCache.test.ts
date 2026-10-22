import { afterEach, expect, test, vi } from "vitest"
import {
  clearMediaCache,
  recallMediaUrl,
  warmMedia,
} from "./mediaCache.ts"
import { safeMediaUrl } from "./protocol.ts"

afterEach(() => {
  clearMediaCache()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

test("authorized static media survives no-store in memory and is released on access changes", async () => {
  const path = "/api/display/view/room/media/music/cover"
  const png = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    ),
    (value) => value.charCodeAt(0),
  )
  const fetch = vi.spyOn(window, "fetch").mockResolvedValue(
    new Response(png, {
      headers: {
        "content-type": "image/png",
        "cache-control": "no-store",
      },
    }),
  )
  await warmMedia({ path }).catch(() => undefined)
  const warmed = safeMediaUrl(path)
  expect(warmed).toMatch(/^blob:/)
  await warmMedia({ path })
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(recallMediaUrl(path)).toBe(warmed)
  clearMediaCache()
  expect(safeMediaUrl(path)).toBe(path)
  expect(safeMediaUrl(warmed)).toBeUndefined()
})

test("warming rejects streams and remote paths", async () => {
  const fetch = vi.spyOn(window, "fetch").mockResolvedValue(
    new Response("video", {
      headers: { "content-type": "video/mp4" },
    }),
  )
  await warmMedia({
    path: "https://outside.example/image.jpg",
  })
  expect(fetch).not.toHaveBeenCalled()
  const path = "/api/display/view/room/media/camera/live"
  await warmMedia({ path })
  expect(recallMediaUrl(path)).toBe(path)
})

test("an outstanding image load cannot repopulate media after access changes", async () => {
  const pending: { resolve?: (value: Response) => void } =
    {}
  vi.spyOn(window, "fetch").mockImplementation(
    () =>
      new Promise((resolve) => {
        pending.resolve = resolve
      }),
  )
  const path = "/api/display/view/room/media/music/cover"
  const warm = warmMedia({ path })
  clearMediaCache()
  pending.resolve?.(
    new Response("picture", {
      headers: { "content-type": "image/png" },
    }),
  )
  await warm
  expect(recallMediaUrl(path)).toBe(path)
})

test("background image requests time out without retaining a partial asset", async () => {
  vi.useFakeTimers()
  const path = "/api/display/view/room/media/slow-cover"
  vi.spyOn(window, "fetch").mockImplementation(
    (_path, options) =>
      new Promise<Response>((_resolve, reject) => {
        options?.signal?.addEventListener(
          "abort",
          () =>
            reject(
              new DOMException("Aborted", "AbortError"),
            ),
          { once: true },
        )
      }),
  )
  const pending = expect(
    warmMedia({ path }),
  ).rejects.toThrow("Aborted")
  await vi.advanceTimersByTimeAsync(2500)
  await pending
  expect(recallMediaUrl(path)).toBe(path)
})
