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
  const kill = vi.fn((_signal: string) => true)
  const child = {
    exitCode: hasExited ? 0 : null,
    signalCode: null,
    kill,
    once: (event: string, listener: () => void) => {
      events.once(event, listener)
      return child
    },
  } as unknown as Parameters<
    typeof stopAndRemoveDirectory
  >[0]["child"]
  return {
    child,
    kill,
    exit: () => events.emit("exit", null, "SIGTERM"),
  }
}

test("printer HLS removes the segment directory only after ffmpeg exits", async () => {
  const ffmpeg = fakeFfmpeg()
  const removeDirectory = vi.fn(async (_path: string) => {})
  const stopped = stopAndRemoveDirectory({
    child: ffmpeg.child,
    directory: "/tmp/castkit-printer-a",
    removeDirectory,
  })
  expect(ffmpeg.kill.mock.calls).toEqual([["SIGTERM"]])
  expect(removeDirectory).not.toHaveBeenCalled()
  ffmpeg.exit()
  await stopped
  expect(removeDirectory.mock.calls).toEqual([
    ["/tmp/castkit-printer-a"],
  ])
})

test("printer HLS removes the directory at once when ffmpeg has already exited", async () => {
  const ffmpeg = fakeFfmpeg({ hasExited: true })
  const removeDirectory = vi.fn(async (_path: string) => {})
  await stopAndRemoveDirectory({
    child: ffmpeg.child,
    directory: "/tmp/castkit-printer-b",
    removeDirectory,
  })
  expect(ffmpeg.kill).not.toHaveBeenCalled()
  expect(removeDirectory.mock.calls).toEqual([
    ["/tmp/castkit-printer-b"],
  ])
})

test("printer HLS logs a failed directory removal instead of rejecting", async () => {
  const ffmpeg = fakeFfmpeg({ hasExited: true })
  const warn = vi
    .spyOn(console, "warn")
    .mockImplementation(() => undefined)
  try {
    const failure = Object.assign(
      new Error("ENOTEMPTY: directory not empty"),
      { code: "ENOTEMPTY" },
    )
    await expect(
      stopAndRemoveDirectory({
        child: ffmpeg.child,
        directory: "/tmp/castkit-printer-c",
        removeDirectory: () => Promise.reject(failure),
      }),
    ).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledWith(
      "[printer-hls] could not remove /tmp/castkit-printer-c:",
      failure,
    )
  } finally {
    warn.mockRestore()
  }
})

test("printer HLS kills an ffmpeg that ignores SIGTERM", async () => {
  vi.useFakeTimers()
  try {
    const ffmpeg = fakeFfmpeg()
    const stopped = stopAndRemoveDirectory({
      child: ffmpeg.child,
      directory: "/tmp/castkit-printer-d",
      removeDirectory: async () => undefined,
    })
    vi.advanceTimersByTime(5_000)
    expect(ffmpeg.kill.mock.calls).toEqual([
      ["SIGTERM"],
      ["SIGKILL"],
    ])
    ffmpeg.exit()
    await stopped
  } finally {
    vi.useRealTimers()
  }
})

test("printer HLS sends no SIGKILL after ffmpeg exits on SIGTERM", async () => {
  vi.useFakeTimers()
  try {
    const ffmpeg = fakeFfmpeg()
    const stopped = stopAndRemoveDirectory({
      child: ffmpeg.child,
      directory: "/tmp/castkit-printer-e",
      removeDirectory: async () => undefined,
    })
    ffmpeg.exit()
    await stopped
    vi.advanceTimersByTime(10_000)
    expect(ffmpeg.kill.mock.calls).toEqual([["SIGTERM"]])
  } finally {
    vi.useRealTimers()
  }
})
