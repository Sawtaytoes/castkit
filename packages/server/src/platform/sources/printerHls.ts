import {
  type ChildProcess,
  spawn,
} from "node:child_process"
import {
  mkdtemp,
  readFile,
  rm,
  stat,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

type Session = {
  directory: string
  process: ChildProcess
  lastRequestAt: number
  startedAt: number
}

const resourceName =
  /^(?:playlist\.m3u8|init\.mp4|segment_\d+\.m4s)$/
const MIME_TYPES: Record<string, string> = {
  "playlist.m3u8": "application/vnd.apple.mpegurl",
  "init.mp4": "video/mp4",
}

/** Keep every HLS request on the authorized CastKit media endpoint. */
export const rewritePrinterPlaylist = (playlist: string) =>
  playlist
    .replace(
      /URI="(init\.mp4)"/g,
      (_, name: string) =>
        `URI="?kind=hls&resource=${name}"`,
    )
    .replace(
      /^(segment_\d+\.m4s)$/gm,
      (_, name: string) => `?kind=hls&resource=${name}`,
    )

/** Copy printer H.264 into short browser-playable HLS segments. */
export const createPrinterHls = () => {
  const sessions = new Map<string, Session>()
  const pendingStarts = new Map<string, Promise<Session>>()
  let isDisposed = false
  const stop = (id: string) => {
    const session = sessions.get(id)
    if (!session) return
    sessions.delete(id)
    session.process.kill("SIGTERM")
    void rm(session.directory, {
      recursive: true,
      force: true,
    })
  }
  const reap = setInterval(() => {
    for (const [id, session] of sessions) {
      if (Date.now() - session.lastRequestAt > 30_000)
        stop(id)
    }
  }, 10_000)
  reap.unref()

  const start = async (
    id: string,
    address: string,
    accessCode: string,
  ) => {
    const directory = await mkdtemp(
      join(tmpdir(), "castkit-printer-"),
    )
    if (isDisposed) {
      await rm(directory, { recursive: true, force: true })
      throw new Error("Printer video source has stopped")
    }
    const url = new URL(
      "rtsps://printer:322/streaming/live/1",
    )
    url.hostname = address
    url.username = "bblp"
    url.password = accessCode
    const process = spawn(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-rtsp_transport",
        "tcp",
        "-i",
        url.toString(),
        "-an",
        "-c:v",
        "copy",
        "-f",
        "hls",
        "-hls_time",
        "1",
        "-hls_list_size",
        "5",
        "-hls_flags",
        "delete_segments+independent_segments",
        "-hls_segment_type",
        "fmp4",
        "-hls_fmp4_init_filename",
        "init.mp4",
        "-hls_segment_filename",
        join(directory, "segment_%06d.m4s"),
        join(directory, "playlist.m3u8"),
      ],
      { stdio: "ignore" },
    )
    const session = {
      directory,
      process,
      lastRequestAt: Date.now(),
      startedAt: Date.now(),
    }
    sessions.set(id, session)
    process.on("error", () => stop(id))
    process.on("exit", () => {
      if (sessions.get(id) === session) stop(id)
    })
    return session
  }
  const getOrStart = (
    id: string,
    address: string,
    accessCode: string,
  ) => {
    const existing = sessions.get(id)
    if (existing) return Promise.resolve(existing)
    const pending = pendingStarts.get(id)
    if (pending) return pending
    const task = start(id, address, accessCode).finally(
      () => {
        pendingStarts.delete(id)
      },
    )
    pendingStarts.set(id, task)
    return task
  }

  const fetchResource = async ({
    id,
    address,
    accessCode,
    resource = "playlist.m3u8",
  }: {
    id: string
    address: string
    accessCode: string
    resource?: string
  }) => {
    if (!resourceName.test(resource))
      throw new Error("Invalid camera resource")
    let session = sessions.get(id)
    if (session && resource === "playlist.m3u8") {
      const modifiedAt = await stat(
        join(session.directory, resource),
      ).then(
        (file) => file.mtimeMs,
        () => session?.startedAt ?? 0,
      )
      if (Date.now() - modifiedAt > 15_000) {
        stop(id)
        session = undefined
      }
    }
    session ??= await getOrStart(id, address, accessCode)
    session.lastRequestAt = Date.now()
    const path = join(session.directory, resource)
    let content: Buffer | undefined
    for (let attempt = 0; attempt < 50; attempt++) {
      content = await readFile(path).catch(() => undefined)
      if (content) break
      await new Promise((resolve) =>
        setTimeout(resolve, 200),
      )
    }
    if (!content)
      throw new Error("Printer video is unavailable")
    if (resource === "playlist.m3u8") {
      content = Buffer.from(
        rewritePrinterPlaylist(content.toString("utf8")),
      )
    }
    return new Response(new Uint8Array(content), {
      headers: {
        "content-type":
          MIME_TYPES[resource] ?? "video/iso.segment",
      },
    })
  }
  return {
    fetchResource,
    dispose: () => {
      isDisposed = true
      clearInterval(reap)
      for (const id of sessions.keys()) stop(id)
    },
  }
}
