import { expect, test, vi } from "vitest"
import { sourceContext } from "./__fixtures__/sourceContext.ts"
import { createHomeAssistantHls } from "./homeAssistantHls.ts"

class FakeHomeAssistantSocket extends EventTarget {
  static requests: Record<string, unknown>[] = []
  constructor(readonly url: string) {
    super()
    queueMicrotask(() =>
      this.emit({ type: "auth_required" }),
    )
  }
  send(value: string) {
    const message = JSON.parse(value) as Record<
      string,
      unknown
    >
    FakeHomeAssistantSocket.requests.push(message)
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

test("HA HLS stays behind CastKit media URLs and forwards low-latency playlist requests", async () => {
  vi.stubGlobal("WebSocket", FakeHomeAssistantSocket)
  FakeHomeAssistantSocket.requests = []
  const fetchRequest = vi.fn<typeof fetch>(
    async (input) => {
      const url = String(input)
      if (url.endsWith("master_playlist.m3u8"))
        return new Response(
          "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000\nplaylist.m3u8\n",
          {
            headers: {
              "content-type":
                "application/vnd.apple.mpegurl",
            },
          },
        )
      if (url.includes("playlist.m3u8"))
        return new Response(
          '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXT-X-PART:URI="./segment/2.1.m4s"\n#EXT-X-PRELOAD-HINT:TYPE=PART,URI="./segment/2.2.m4s"\n./segment/2.m4s\n',
          {
            headers: {
              "content-type":
                "application/vnd.apple.mpegurl",
            },
          },
        )
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": "video/mp4" },
      })
    },
  )
  const context = sourceContext({ fetch: fetchRequest })
  const hls = createHomeAssistantHls(context, {
    Authorization: "Bearer test-token",
  })
  try {
    const master = await hls.fetchResource({
      assetId: "camera.example",
      query: {},
    })
    const masterText = await master.text()
    expect(masterText).not.toContain("abcdef012345")
    expect(masterText).toContain("?kind=hls&session=")
    const childUrl = new URL(
      masterText.trim().split("\n").at(-1)!,
      "https://castkit.example/media/camera.example",
    )
    const child = await hls.fetchResource({
      assetId: "camera.example",
      query: {
        ...Object.fromEntries(childUrl.searchParams),
        _HLS_msn: "2",
        _HLS_part: "1",
      },
    })
    const childText = await child.text()
    expect(childText).toContain('URI="?kind=hls&session=')
    expect(childText).toContain("resource=segment%2F2.m4s")
    expect(fetchRequest).toHaveBeenCalledWith(
      "https://service.example/api/hls/abcdef012345/playlist.m3u8?_HLS_msn=2&_HLS_part=1",
      expect.objectContaining({
        headers: { Authorization: "Bearer test-token" },
      }),
    )
    await expect(
      hls.fetchResource({
        assetId: "camera.other",
        query: Object.fromEntries(childUrl.searchParams),
      }),
    ).rejects.toThrow("Unknown camera stream session")
    await expect(
      hls.fetchResource({
        assetId: "camera.example",
        query: {
          ...Object.fromEntries(childUrl.searchParams),
          resource: "../api/states",
        },
      }),
    ).rejects.toThrow("Invalid camera stream resource")
    expect(FakeHomeAssistantSocket.requests).toEqual([
      { type: "auth", access_token: "test-token" },
      {
        id: 1,
        type: "camera/stream",
        entity_id: "camera.example",
        format: "hls",
      },
    ])
  } finally {
    hls.dispose()
    vi.unstubAllGlobals()
  }
})
