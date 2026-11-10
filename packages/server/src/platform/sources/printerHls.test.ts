import { EventEmitter } from "node:events"
import { expect, test, vi } from "vitest"
import {
  rewritePrinterPlaylist,
  stopAndRemoveDirectory,
} from "./printerHls.ts"

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

const fakeFfmpeg = ({
  hasExited = false,
}: {
  hasExited?: boolean
} = {}) => {
  const events = new EventEmitter()
  const signals: string[] = []
  const child = {
    exitCode: hasExited ? 0 : null,
    signalCode: null,
    kill: (signal: string) => {
      signals.push(signal)
      return true
    },
    once: (event: string, listener: () => void) => {
      events.once(event, listener)
      return child
    },
  }
  return {
    child: child as unknown as Parameters<
      typeof stopAndRemoveDirectory
    >[0],
    signals,
    exit: () => events.emit("exit", null, "SIGTERM"),
  }
}

test("printer HLS removes the segment directory only after ffmpeg exits", async () => {
  const ffmpeg = fakeFfmpeg()
  const removed: string[] = []
  const stopped = stopAndRemoveDirectory(
    ffmpeg.child,
    "/tmp/castkit-printer-a",
    async (path) => {
      removed.push(path)
    },
  )
  await Promise.resolve()
  expect(ffmpeg.signals).toEqual(["SIGTERM"])
  expect(removed).toEqual([])
  ffmpeg.exit()
  await stopped
  expect(removed).toEqual(["/tmp/castkit-printer-a"])
})

test("printer HLS removes the directory at once when ffmpeg has already exited", async () => {
  const ffmpeg = fakeFfmpeg({ hasExited: true })
  const removed: string[] = []
  await stopAndRemoveDirectory(
    ffmpeg.child,
    "/tmp/castkit-printer-b",
    async (path) => {
      removed.push(path)
    },
  )
  expect(ffmpeg.signals).toEqual([])
  expect(removed).toEqual(["/tmp/castkit-printer-b"])
})

test("printer HLS logs a failed directory removal instead of rejecting", async () => {
  const ffmpeg = fakeFfmpeg({ hasExited: true })
  const warn = vi
    .spyOn(console, "warn")
    .mockImplementation(() => undefined)
  const failure = Object.assign(
    new Error("ENOTEMPTY: directory not empty"),
    { code: "ENOTEMPTY" },
  )
  await expect(
    stopAndRemoveDirectory(
      ffmpeg.child,
      "/tmp/castkit-printer-c",
      () => Promise.reject(failure),
    ),
  ).resolves.toBeUndefined()
  expect(warn).toHaveBeenCalledWith(
    "[printer-hls] could not remove /tmp/castkit-printer-c:",
    failure,
  )
  warn.mockRestore()
})

test("printer HLS kills an ffmpeg that ignores SIGTERM", async () => {
  vi.useFakeTimers()
  try {
    const ffmpeg = fakeFfmpeg()
    const stopped = stopAndRemoveDirectory(
      ffmpeg.child,
      "/tmp/castkit-printer-d",
      async () => undefined,
    )
    vi.advanceTimersByTime(5_000)
    expect(ffmpeg.signals).toEqual(["SIGTERM", "SIGKILL"])
    ffmpeg.exit()
    await stopped
  } finally {
    vi.useRealTimers()
  }
})
