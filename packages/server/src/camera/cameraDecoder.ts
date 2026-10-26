import { spawn } from "node:child_process"
import { Readable } from "node:stream"
import { createFramePacer } from "./framePacer.ts"
import {
  createPamParser,
  type DecodedPicture,
} from "./pamStream.ts"

/** Pictures per second the decoder hands on; above what any image panel draws. */
export const DECODED_FRAMES_PER_SECOND = 10
/** Decoded pictures fit inside this square, keeping the camera's aspect. */
export const DECODED_MAXIMUM_SIZE = 480

/**
 * ffmpeg arguments for one camera: a fragmented MP4 on stdin, packed RGB
 * pictures on stdout. Two decoder threads and one filter thread bound its CPU;
 * every image panel's profile is scaled from this one decode.
 */
export const decoderArguments = ({
  framesPerSecond = DECODED_FRAMES_PER_SECOND,
  maximumSize = DECODED_MAXIMUM_SIZE,
}: {
  framesPerSecond?: number
  maximumSize?: number
} = {}) => [
  "-hide_banner",
  "-loglevel",
  "error",
  // No `-fflags +nobuffer`: with it the MP4 demuxer reads one fragment of a
  // pipe and stops (ffmpeg 7.1, measured 2026-10-26).
  "-flags",
  "low_delay",
  "-probesize",
  "65536",
  "-threads",
  "2",
  "-f",
  "mp4",
  "-i",
  "pipe:0",
  "-an",
  "-sn",
  "-dn",
  "-filter_threads",
  "1",
  "-vf",
  `fps=${framesPerSecond},scale=w=${maximumSize}:h=${maximumSize}:force_original_aspect_ratio=decrease:flags=area`,
  "-pix_fmt",
  "rgb24",
  "-c:v",
  "pam",
  "-f",
  "image2pipe",
  "pipe:1",
]

type SpawnDecoder = (
  command: string,
  argumentsList: string[],
) => {
  stdin: NodeJS.WritableStream & { destroy: () => void }
  stdout: NodeJS.ReadableStream
  stderr: NodeJS.ReadableStream
  kill: (signal?: NodeJS.Signals) => boolean
  on: (
    event: "close",
    listener: (code: number | null) => void,
  ) => unknown
}

/**
 * Decode one camera stream with ffmpeg and release its pictures at the pace
 * the camera took them (see `createFramePacer`). Stops when the stream ends,
 * ffmpeg exits, or `stop` is called; `onEnd` names the reason.
 */
export const startCameraDecoder = ({
  input,
  onPicture,
  onEnd,
  framesPerSecond = DECODED_FRAMES_PER_SECOND,
  bufferMilliseconds = 1000,
  spawnDecoder = (command, argumentsList) =>
    spawn(command, argumentsList, {
      stdio: ["pipe", "pipe", "pipe"],
    }),
  command = "ffmpeg",
}: {
  input: ReadableStream<Uint8Array>
  onPicture: (picture: DecodedPicture) => void
  onEnd: (error?: Error) => void
  framesPerSecond?: number
  /** How far behind arrival pictures are spread; one HLS part. */
  bufferMilliseconds?: number
  spawnDecoder?: SpawnDecoder
  command?: string
}) => {
  const state = {
    isStopped: false,
    pictures: 0,
    errorText: "",
  }
  const pacer = createFramePacer<DecodedPicture>({
    bufferMilliseconds,
    onRelease: onPicture,
  })
  const child = spawnDecoder(
    command,
    decoderArguments({ framesPerSecond }),
  )
  // Destroying the Node side cancels the web stream, which stops the reader.
  const source = Readable.fromWeb(
    input as Parameters<typeof Readable.fromWeb>[0],
  )
  const finish = (error?: Error) => {
    if (state.isStopped) return
    state.isStopped = true
    pacer.dispose()
    child.kill("SIGKILL")
    source.unpipe()
    source.destroy()
    onEnd(error)
  }
  const parser = createPamParser((picture) => {
    pacer.push(
      picture,
      (state.pictures * 1000) / framesPerSecond,
    )
    state.pictures += 1
  })
  child.stdout.on("data", (chunk: Buffer) => {
    try {
      parser.push(chunk)
    } catch (error) {
      finish(
        error instanceof Error
          ? error
          : new Error("Camera decode failed."),
      )
    }
  })
  child.stderr.on("data", (chunk: Buffer) => {
    state.errorText =
      `${state.errorText}${chunk.toString()}`.slice(-500)
  })
  child.on("close", (code) => {
    finish(
      new Error(
        `The camera decoder exited (${code ?? "signal"})${state.errorText ? `: ${state.errorText.trim()}` : ""}`,
      ),
    )
  })
  child.stdin.on("error", () => {
    // ffmpeg closing its input is reported by its exit.
  })
  // The end of the input closes ffmpeg's stdin; its exit then ends the decoder.
  source.on("error", (error) => finish(error))
  source.pipe(child.stdin)
  return {
    stop: () => finish(),
  }
}
