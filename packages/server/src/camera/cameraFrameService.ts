import { createHash } from "node:crypto"
import sharp from "sharp"
import {
  DECODED_MAXIMUM_SIZE,
  startCameraDecoder,
} from "./cameraDecoder.ts"
import {
  type CameraFrameLayout,
  composeCameraFrame,
  type FrameRectangle,
  getCameraFrameLayout,
  type RenderTextMask,
  type TextMask,
} from "./cameraFrameLayout.ts"
import type { DecodedPicture } from "./pamStream.ts"

/** A channel asset the frames come from. */
export type CameraAsset = {
  channelId: string
  assetId: string
}

/** Where one camera's pictures come from: video first, stills until it plays. */
export type CameraFrameSource = {
  video?: CameraAsset
  still?: CameraAsset
}

/** One finished panel frame, shared by every panel of the same profile. */
export type CameraPanelFrame = {
  /** The source picture's sequence; a reader asks for anything newer. */
  sequence: number
  /** The whole panel frame, big-endian RGB565. */
  pixels: Buffer
  /** The rectangle `body` replaces. */
  patch: FrameRectangle
  /** zlib of the patch rectangle's pixels. */
  body: Buffer
  /** Changes when anything outside the patch changes. */
  layout: string
  origin: "video" | "still"
  receivedAt: number
}

type Picture = DecodedPicture & {
  sequence: number
  origin: "video" | "still"
  receivedAt: number
}

type Session = {
  source: CameraFrameSource
  latest: Picture | undefined
  lastVideoAt: number
  lastReadAt: number
  waiters: Set<() => void>
  profiles: Map<
    string,
    { sequence: number; frame: Promise<CameraPanelFrame> }
  >
  controller: AbortController
  decoder: { stop: () => void } | undefined
  decoderFailures: number
  isStillRunning: boolean
}

/** A video that has said nothing this long is treated as stalled; stills resume. */
const VIDEO_STALL_MILLISECONDS = 3000
const STILL_INTERVAL_MILLISECONDS = 500
const DECODER_RETRY_MILLISECONDS = [
  1000, 2000, 5000, 10_000,
]
const MAXIMUM_PROFILES = 4
const MAXIMUM_TEXT_MASKS = 64

const sessionKey = (source: CameraFrameSource) =>
  JSON.stringify([
    source.video?.channelId,
    source.video?.assetId,
    source.still?.channelId,
    source.still?.assetId,
  ])

const formatTime = (milliseconds: number) =>
  new Date(milliseconds).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  })

/**
 * The camera alert on image-stream panels, without a browser
 * (docs/decisions/2026-10-26-the-camera-alert-streams-directly-and-lasts-while-a-person-is-detected.md).
 *
 * One session per camera decodes it once with ffmpeg, only while some panel is
 * reading; a session nobody has read for `idleMilliseconds` stops its decoder
 * and its still requests, so an idle server spends nothing. Each panel profile
 * (size) is scaled, composed and compressed once per picture, and every panel of
 * that profile gets the same bytes. A reader asks for the picture after the one
 * it last sent, so a slow panel skips pictures instead of queueing them.
 */
export const createCameraFrameService = ({
  getMedia,
  renderText,
  idleMilliseconds = 15_000,
  now = Date.now,
  startDecoder = startCameraDecoder,
  log = console,
}: {
  getMedia: (request: {
    channelId: string
    assetId: string
    kind: string
    signal: AbortSignal
  }) => Promise<Response>
  renderText: RenderTextMask
  idleMilliseconds?: number
  now?: () => number
  startDecoder?: typeof startCameraDecoder
  log?: Pick<Console, "log" | "warn">
}) => {
  const sessions = new Map<string, Session>()
  const counter = { sequence: 0 }
  const textMasks = new Map<string, TextMask>()
  const cachedText: RenderTextMask = (request) => {
    const key = JSON.stringify(request)
    const held = textMasks.get(key)
    if (held) return held
    if (textMasks.size >= MAXIMUM_TEXT_MASKS)
      textMasks.clear()
    const mask = renderText(request)
    textMasks.set(key, mask)
    return mask
  }
  const publish = (
    session: Session,
    picture: DecodedPicture,
    origin: "video" | "still",
  ) => {
    counter.sequence += 1
    session.latest = {
      ...picture,
      sequence: counter.sequence,
      origin,
      receivedAt: now(),
    }
    const waiters = Array.from(session.waiters)
    session.waiters.clear()
    waiters.forEach((wake) => {
      wake()
    })
  }
  const isVideoPlaying = (session: Session) =>
    now() - session.lastVideoAt < VIDEO_STALL_MILLISECONDS
  const pause = (
    milliseconds: number,
    signal: AbortSignal,
  ) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, milliseconds)
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer)
          resolve()
        },
        { once: true },
      )
    })
  const runStills = async (session: Session) => {
    const still = session.source.still
    if (!still || session.isStillRunning) return
    session.isStillRunning = true
    const signal = session.controller.signal
    try {
      while (!signal.aborted && !isVideoPlaying(session)) {
        const startedAt = now()
        try {
          const response = await getMedia({
            ...still,
            kind: "camera",
            signal,
          })
          const { data, info } = await sharp(
            Buffer.from(await response.arrayBuffer()),
          )
            .resize(
              DECODED_MAXIMUM_SIZE,
              DECODED_MAXIMUM_SIZE,
              { fit: "inside" },
            )
            .removeAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true })
          if (!signal.aborted && !isVideoPlaying(session))
            publish(
              session,
              {
                width: info.width,
                height: info.height,
                rgb: data,
              },
              "still",
            )
        } catch (error) {
          if (!signal.aborted)
            log.warn(
              `[castkit] camera still unavailable: ${error instanceof Error ? error.message : String(error)}`,
            )
        }
        await pause(
          Math.max(
            100,
            STILL_INTERVAL_MILLISECONDS -
              (now() - startedAt),
          ),
          signal,
        )
      }
    } finally {
      session.isStillRunning = false
    }
  }
  const runVideo = async (session: Session) => {
    const video = session.source.video
    const signal = session.controller.signal
    if (!video || signal.aborted) return
    try {
      const response = await getMedia({
        ...video,
        kind: "video",
        signal,
      })
      if (!response.body)
        throw new Error("The camera sent no video.")
      session.decoder = startDecoder({
        input: response.body,
        onPicture: (picture) => {
          session.lastVideoAt = now()
          session.decoderFailures = 0
          publish(session, picture, "video")
        },
        onEnd: (error) => {
          session.decoder = undefined
          if (signal.aborted) return
          log.warn(
            `[castkit] camera video stopped: ${error?.message ?? "ended"}`,
          )
          retryVideo(session)
        },
      })
      log.log(
        `[castkit] camera video started ${video.channelId}`,
      )
    } catch (error) {
      if (signal.aborted) return
      log.warn(
        `[castkit] camera video unavailable: ${error instanceof Error ? error.message : String(error)}`,
      )
      retryVideo(session)
    }
  }
  const retryVideo = (session: Session) => {
    void runStills(session)
    const delay =
      DECODER_RETRY_MILLISECONDS[
        Math.min(
          session.decoderFailures,
          DECODER_RETRY_MILLISECONDS.length - 1,
        )
      ] ?? 10_000
    session.decoderFailures += 1
    void pause(delay, session.controller.signal).then(() =>
      runVideo(session),
    )
  }
  const stop = (key: string, session: Session) => {
    sessions.delete(key)
    session.controller.abort()
    session.decoder?.stop()
    session.waiters.forEach((wake) => {
      wake()
    })
    log.log("[castkit] camera frames idle; decoder stopped")
  }
  const open = (source: CameraFrameSource) => {
    const key = sessionKey(source)
    const held = sessions.get(key)
    if (held) return held
    const session: Session = {
      source,
      latest: undefined,
      lastVideoAt: 0,
      lastReadAt: now(),
      waiters: new Set(),
      profiles: new Map(),
      controller: new AbortController(),
      decoder: undefined,
      decoderFailures: 0,
      isStillRunning: false,
    }
    sessions.set(key, session)
    void runStills(session)
    void runVideo(session)
    return session
  }
  const idleTimer = setInterval(() => {
    sessions.forEach((session, key) => {
      if (
        session.waiters.size === 0 &&
        now() - session.lastReadAt > idleMilliseconds
      )
        stop(key, session)
    })
  }, 1000)
  idleTimer.unref()
  const render = async ({
    picture,
    width,
    height,
    label,
  }: {
    picture: Picture
    width: number
    height: number
    label: string
  }): Promise<CameraPanelFrame> => {
    const layout: CameraFrameLayout = getCameraFrameLayout({
      width,
      height,
      sourceWidth: picture.width,
      sourceHeight: picture.height,
    })
    const camera =
      layout.camera.width === picture.width &&
      layout.camera.height === picture.height
        ? picture.rgb
        : await sharp(picture.rgb, {
            raw: {
              width: picture.width,
              height: picture.height,
              channels: 3,
            },
          })
            .resize(
              layout.camera.width,
              layout.camera.height,
              {
                fit: "fill",
              },
            )
            .raw()
            .toBuffer()
    const status =
      picture.origin === "video" ? "Live" : "Snapshot"
    const { pixels, body } = await composeCameraFrame({
      layout,
      camera,
      label,
      status,
      time: formatTime(picture.receivedAt),
      renderText: cachedText,
    })
    return {
      sequence: picture.sequence,
      pixels,
      patch: layout.patch,
      body,
      layout: createHash("sha256")
        .update(
          JSON.stringify([
            width,
            height,
            layout.camera,
            layout.header ? [label, status] : null,
          ]),
        )
        .digest("hex")
        .slice(0, 16),
      origin: picture.origin,
      receivedAt: picture.receivedAt,
    }
  }
  const frameFor = ({
    session,
    width,
    height,
    label,
  }: {
    session: Session
    width: number
    height: number
    label: string
  }) => {
    const picture = session.latest
    if (!picture) return undefined
    const profileKey = JSON.stringify([
      width,
      height,
      label,
    ])
    const held = session.profiles.get(profileKey)
    if (held?.sequence === picture.sequence)
      return held.frame
    const frame = render({ picture, width, height, label })
    if (
      !session.profiles.has(profileKey) &&
      session.profiles.size >= MAXIMUM_PROFILES
    ) {
      const oldest = session.profiles.keys().next().value
      if (oldest !== undefined)
        session.profiles.delete(oldest)
    }
    session.profiles.set(profileKey, {
      sequence: picture.sequence,
      frame,
    })
    frame.catch(() => {
      if (session.profiles.get(profileKey)?.frame === frame)
        session.profiles.delete(profileKey)
    })
    return frame
  }
  return {
    /**
     * The newest frame for this profile once its picture is newer than
     * `after`, or undefined after `timeoutMilliseconds`.
     */
    waitForFrame: async ({
      source,
      width,
      height,
      label,
      after = 0,
      timeoutMilliseconds = 5000,
      signal,
    }: {
      source: CameraFrameSource
      width: number
      height: number
      label: string
      after?: number
      timeoutMilliseconds?: number
      signal?: AbortSignal
    }) => {
      const session = open(source)
      session.lastReadAt = now()
      // A video that stalled without ending hands back to stills.
      if (!isVideoPlaying(session)) void runStills(session)
      if ((session.latest?.sequence ?? 0) <= after) {
        await new Promise<void>((resolve) => {
          const finish = () => {
            clearTimeout(timer)
            session.waiters.delete(finish)
            signal?.removeEventListener("abort", finish)
            resolve()
          }
          const timer = setTimeout(
            finish,
            timeoutMilliseconds,
          )
          session.waiters.add(finish)
          signal?.addEventListener("abort", finish, {
            once: true,
          })
        })
        session.lastReadAt = now()
      }
      if (
        signal?.aborted ||
        (session.latest?.sequence ?? 0) <= after
      )
        return undefined
      return frameFor({ session, width, height, label })
    },
    /** Sessions running now, for health reports and tests. */
    listSessions: () =>
      Array.from(sessions.values()).map((session) => ({
        source: session.source,
        isVideoPlaying: isVideoPlaying(session),
        sequence: session.latest?.sequence ?? 0,
        profiles: session.profiles.size,
      })),
    dispose: () => {
      clearInterval(idleTimer)
      sessions.forEach((session, key) => {
        stop(key, session)
      })
    },
  }
}

export type CameraFrameService = ReturnType<
  typeof createCameraFrameService
>
