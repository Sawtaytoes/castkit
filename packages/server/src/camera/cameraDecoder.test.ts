import { execFileSync, spawnSync } from "node:child_process"
import { expect, test } from "vitest"
import {
  decoderArguments,
  startCameraDecoder,
} from "./cameraDecoder.ts"
import {
  createPamParser,
  type DecodedPicture,
} from "./pamStream.ts"

const hasFfmpeg =
  spawnSync("ffmpeg", ["-version"], { stdio: "ignore" })
    .status === 0

/**
 * A synthetic 4:3 camera: ffmpeg's test pattern, 2 s at 20 fps, H.264 in the
 * fragmented MP4 a low-latency HLS reader hands on. No camera picture is used.
 */
const syntheticCameraVideo = () =>
  execFileSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=640x480:rate=20:duration=2",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-g",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "frag_keyframe+empty_moov+default_base_moof",
      "-f",
      "mp4",
      "pipe:1",
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  )

test("the decoder reads stdin as fragmented MP4 and writes self-describing pictures", () => {
  const argumentsList = decoderArguments()
  expect(
    argumentsList.slice(
      argumentsList.indexOf("-i") - 2,
      argumentsList.indexOf("-i") + 2,
    ),
  ).toEqual(["-f", "mp4", "-i", "pipe:0"])
  expect(argumentsList).toContain(
    "fps=10,scale=w=480:h=480:force_original_aspect_ratio=decrease:flags=area",
  )
  expect(argumentsList.slice(-5)).toEqual([
    "-c:v",
    "pam",
    "-f",
    "image2pipe",
    "pipe:1",
  ])
})

test.skipIf(!hasFfmpeg)(
  "the decoder arguments turn 2 s of a 20 fps 4:3 camera into twenty 480x360 pictures",
  () => {
    const received: { pictures: DecodedPicture[] } = {
      pictures: [],
    }
    createPamParser((picture) => {
      received.pictures = received.pictures.concat(picture)
    }).push(
      execFileSync("ffmpeg", decoderArguments(), {
        input: syntheticCameraVideo(),
        maxBuffer: 64 * 1024 * 1024,
      }),
    )
    expect(
      received.pictures.map(
        (picture) => `${picture.width}x${picture.height}`,
      ),
    ).toEqual(Array.from({ length: 20 }, () => "480x360"))
  },
)

test.skipIf(!hasFfmpeg)(
  "a synthetic camera streamed in pieces reaches the panel side as paced pictures",
  async () => {
    const video = syntheticCameraVideo()
    const received: { pictures: DecodedPicture[] } = {
      pictures: [],
    }
    const ended = await new Promise<Error | undefined>(
      (resolve) => {
        startCameraDecoder({
          input: new ReadableStream<Uint8Array>({
            start: (controller) => {
              // Arrive in uneven pieces, as HTTP parts do.
              Array.from({
                length: Math.ceil(video.length / 7000),
              }).forEach((_, index) => {
                controller.enqueue(
                  video.subarray(
                    index * 7000,
                    (index + 1) * 7000,
                  ),
                )
              })
              controller.close()
            },
          }),
          onPicture: (picture) => {
            received.pictures =
              received.pictures.concat(picture)
          },
          onEnd: resolve,
          bufferMilliseconds: 0,
        })
      },
    )
    expect(ended?.message).toMatch(/exited \(0\)/)
    // Decoded faster than real time, a burst collapses into its newest pictures.
    expect(received.pictures.length).toBeGreaterThan(0)
    expect(
      received.pictures.every(
        (picture) =>
          picture.width === 480 &&
          picture.height === 360 &&
          picture.rgb.length === 480 * 360 * 3,
      ),
    ).toBe(true)
  },
)
