import { afterEach, expect, test, vi } from "vitest"
import { sourceContext } from "./__fixtures__/sourceContext.ts"
import {
  findStartPart,
  nextPartCursor,
  openHomeAssistantVideo,
  parseLowLatencyPlaylist,
} from "./homeAssistantVideo.ts"

/** The shape Home Assistant serves: parts before their segment, trailing parts in progress. */
const playlist = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-MAP:URI="init.mp4"
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:40
#EXT-X-PART-INF:PART-TARGET=1.000
#EXTINF:10.000,
./segment/40.m4s
#EXT-X-PART:DURATION=0.900,URI="./segment/41.0.m4s",INDEPENDENT=YES
#EXT-X-PART:DURATION=0.900,URI="./segment/41.1.m4s"
#EXT-X-PART:DURATION=0.150,URI="./segment/41.2.m4s"
#EXTINF:1.950,
./segment/41.m4s
#EXT-X-PART:DURATION=0.900,URI="./segment/42.0.m4s",INDEPENDENT=YES
#EXT-X-PART:DURATION=0.900,URI="./segment/42.1.m4s"
#EXT-X-PRELOAD-HINT:TYPE=PART,URI="./segment/42.2.m4s"
`

test("parts belong to the segment after them, and trailing parts to the one in progress", () => {
  const parsed = parseLowLatencyPlaylist(playlist)
  expect(parsed.mapUri).toBe("init.mp4")
  expect(
    parsed.parts.map(
      (part) =>
        `${part.mediaSequence}.${part.index}${part.isIndependent ? "!" : ""}`,
    ),
  ).toEqual(["41.0!", "41.1", "41.2", "42.0!", "42.1"])
  expect([...parsed.completeSegments]).toEqual([40, 41])
  // Start at the newest key frame, never replaying older parts.
  expect(findStartPart(parsed)).toMatchObject({
    mediaSequence: 42,
    index: 0,
  })
  // A finished segment hands over to the next one's first part.
  expect(
    nextPartCursor({
      playlist: parsed,
      cursor: { mediaSequence: 41, index: 2 },
    }),
  ).toEqual({ mediaSequence: 42, index: 0 })
  expect(
    nextPartCursor({
      playlist: parsed,
      cursor: { mediaSequence: 42, index: 1 },
    }),
  ).toEqual({ mediaSequence: 42, index: 2 })
})

class FakeSocket extends EventTarget {
  constructor(readonly url: string) {
    super()
    queueMicrotask(() =>
      this.emit({ type: "auth_required" }),
    )
  }
  send(value: string) {
    const message = JSON.parse(value) as { type: string }
    if (message.type === "auth")
      queueMicrotask(() => this.emit({ type: "auth_ok" }))
    if (message.type === "camera/stream")
      queueMicrotask(() =>
        this.emit({
          id: 1,
          type: "result",
          success: true,
          result: {
            url: "/api/hls/abcdef012345/master_playlist.m3u8",
          },
        }),
      )
  }
  close() {}
  private emit(value: Record<string, unknown>) {
    this.dispatchEvent(
      new MessageEvent("message", {
        data: JSON.stringify(value),
      }),
    )
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

test("the reader sends the init section, then each part from the newest key frame, waiting on blocking reloads", async () => {
  vi.stubGlobal("WebSocket", FakeSocket)
  const later = playlist.replace(
    '#EXT-X-PRELOAD-HINT:TYPE=PART,URI="./segment/42.2.m4s"',
    '#EXT-X-PART:DURATION=0.900,URI="./segment/42.2.m4s"',
  )
  const fetchRequest = vi.fn<typeof fetch>(
    async (input) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith("master_playlist.m3u8"))
        return new Response(
          "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nplaylist.m3u8\n",
        )
      if (url.pathname.endsWith("playlist.m3u8"))
        return new Response(url.search ? later : playlist)
      const name = url.pathname.split("/").at(-1) ?? ""
      return new Response(
        new TextEncoder().encode(`[${name}]`),
      )
    },
  )
  const controller = new AbortController()
  const stream = openHomeAssistantVideo({
    context: sourceContext({ fetch: fetchRequest }),
    headers: { Authorization: "Bearer test-token" },
    entityId: "camera.example",
    signal: controller.signal,
  })
  const reader = stream.getReader()
  const chunks = await Promise.all(
    Array.from({ length: 4 }).map(() =>
      reader
        .read()
        .then((result) =>
          new TextDecoder().decode(result.value),
        ),
    ),
  )
  expect(chunks).toEqual([
    "[init.mp4]",
    "[42.0.m4s]",
    "[42.1.m4s]",
    "[42.2.m4s]",
  ])
  expect(fetchRequest).toHaveBeenCalledWith(
    "https://service.example/api/hls/abcdef012345/playlist.m3u8?_HLS_msn=42&_HLS_part=2",
    expect.anything(),
  )
  await reader.cancel()
  controller.abort()
})
