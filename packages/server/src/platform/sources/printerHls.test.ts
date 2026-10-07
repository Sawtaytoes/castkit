import { expect, test } from "vitest"
import { rewritePrinterPlaylist } from "./printerHls.ts"

test("printer HLS playlist keeps its init and segments on the same authorized endpoint", () => {
  expect(
    rewritePrinterPlaylist(
      [
        "#EXTM3U",
        '#EXT-X-MAP:URI="init.mp4"',
        "#EXTINF:2.0,",
        "segment_000001.m4s",
      ].join("\n"),
    ),
  ).toBe(
    [
      "#EXTM3U",
      '#EXT-X-MAP:URI="?kind=hls&resource=init.mp4"',
      "#EXTINF:2.0,",
      "?kind=hls&resource=segment_000001.m4s",
    ].join("\n"),
  )
})
