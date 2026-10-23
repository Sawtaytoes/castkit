import { createSocket, type Socket } from "node:dgram"
import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import { join } from "node:path"
import {
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  session,
} from "electron"
import type { CaptureStatus } from "./audioCapture/captureApi.ts"
import {
  capturePcmChannel,
  captureStatusChannel,
} from "./ipcChannels.ts"
import {
  canCaptureSystemAudio,
  type PcAudioSettings,
  type PcAudioStatus,
  pcAudioFormat,
} from "./pcAudioSettings.ts"
import { createPacketizer } from "./vbanPacket.ts"

// The capture page gets its own in-memory session, so its media permission
// is granted there and nowhere else.
const capturePartition = "castkit-audio-capture"

// A capture that stops by itself (a device unplugged, the output device
// changed) is opened again after this long, for as long as sending is on.
const retryDelay = 5000

/**
 * Sends this computer's audio to a VBAN receiver, such as Music Assistant's
 * VBAN Receiver plugin. A hidden window captures the audio, and this process
 * cuts it into VBAN packets and sends them over UDP. Nothing is captured and
 * nothing is sent while sending is off.
 */
export const createPcAudioSender = ({
  distDirectory,
  onStatusChanged,
  log,
}: {
  distDirectory: string
  onStatusChanged: () => void
  log: (message: string) => void
}) => {
  const current: {
    status: PcAudioStatus
    window: BrowserWindow | null
    socket: Socket | null
    packetizer: ReturnType<typeof createPacketizer> | null
    retryTimer?: ReturnType<typeof setTimeout>
    // Bumped by every start and stop, so a start that finishes after a
    // newer change drops its result instead of resurrecting the old one.
    generation: number
    settings: PcAudioSettings | null
    hasReportedSendError: boolean
  } = {
    status: { kind: "off" },
    window: null,
    socket: null,
    packetizer: null,
    generation: 0,
    settings: null,
    hasReportedSendError: false,
  }

  const setStatus = (status: PcAudioStatus) => {
    current.status = status
    onStatusChanged()
  }

  const isFromCaptureWindow = (senderId: number) =>
    current.window !== null &&
    !current.window.isDestroyed() &&
    current.window.webContents.id === senderId

  const captureSession = session.fromPartition(
    capturePartition,
  )
  captureSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      callback(
        permission === "media" &&
          isFromCaptureWindow(webContents.id),
      )
    },
  )
  captureSession.setPermissionCheckHandler(
    (webContents, permission) =>
      permission === "media" &&
      webContents !== null &&
      isFromCaptureWindow(webContents.id),
  )
  // `getDisplayMedia` in the capture page is answered with the system
  // loopback: everything this computer plays. Chromium needs a video source
  // as well; the page stops that track at once.
  captureSession.setDisplayMediaRequestHandler(
    (request, callback) => {
      const mainFrame =
        current.window && !current.window.isDestroyed()
          ? current.window.webContents.mainFrame
          : null
      if (
        !canCaptureSystemAudio(process.platform) ||
        request.frame === null ||
        mainFrame === null ||
        request.frame.processId !== mainFrame.processId ||
        request.frame.routingId !== mainFrame.routingId
      ) {
        callback({})
        return
      }
      void desktopCapturer
        .getSources({ types: ["screen"] })
        .then((sources) => {
          const [screenSource] = sources
          callback(
            screenSource
              ? { video: screenSource, audio: "loopback" }
              : {},
          )
        })
    },
  )

  const closeCapture = () => {
    clearTimeout(current.retryTimer)
    if (current.window && !current.window.isDestroyed()) {
      current.window.destroy()
    }
    current.window = null
    current.socket?.close()
    current.socket = null
    current.packetizer = null
  }

  const start = async (settings: PcAudioSettings) => {
    current.generation += 1
    const generation = current.generation
    closeCapture()
    setStatus({ kind: "starting" })
    if (
      settings.inputDeviceLabel === null &&
      !canCaptureSystemAudio(process.platform)
    ) {
      setStatus({
        kind: "failed",
        message:
          "Only Windows can capture everything this computer plays. Choose an input device instead.",
      })
      return
    }
    const address = await (async () => {
      if (isIP(settings.host) !== 0) {
        return {
          address: settings.host,
          family: isIP(settings.host),
        }
      }
      try {
        return await lookup(settings.host)
      } catch {
        return null
      }
    })()
    if (generation !== current.generation) {
      return
    }
    if (!address) {
      setStatus({
        kind: "failed",
        message: `No computer answers to the name ${settings.host}.`,
      })
      scheduleRetry(settings)
      return
    }
    const socket = createSocket(
      address.family === 6 ? "udp6" : "udp4",
    )
    socket.on("error", (error) => {
      log(`The audio socket failed: ${String(error)}`)
    })
    current.socket = socket
    current.hasReportedSendError = false
    const destination = `${settings.host}:${settings.port}`
    current.packetizer = createPacketizer({
      streamName: settings.streamName,
      sampleRate: pcAudioFormat.sampleRate,
      channels: pcAudioFormat.channels,
      onPacket: (packet) => {
        socket.send(
          packet,
          settings.port,
          address.address,
          (error) => {
            if (error && !current.hasReportedSendError) {
              current.hasReportedSendError = true
              log(
                `Could not send audio to ${destination}: ${String(error)}`,
              )
            }
          },
        )
      },
    })
    const captureWindow = new BrowserWindow({
      show: false,
      width: 320,
      height: 120,
      webPreferences: {
        partition: capturePartition,
        preload: join(
          distDirectory,
          "audioCapture",
          "capturePreload.cjs",
        ),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webviewTag: false,
        // The window is never shown, and it must keep capturing.
        backgroundThrottling: false,
        autoplayPolicy: "no-user-gesture-required",
      },
    })
    captureWindow.webContents.on(
      "will-navigate",
      (event) => {
        event.preventDefault()
      },
    )
    captureWindow.webContents.setWindowOpenHandler(() => ({
      action: "deny",
    }))
    captureWindow.webContents.on(
      "render-process-gone",
      () => {
        if (generation === current.generation) {
          setStatus({
            kind: "failed",
            message:
              "The audio capture stopped unexpectedly.",
          })
          scheduleRetry(settings)
        }
      },
    )
    current.window = captureWindow
    current.settings = settings
    void captureWindow.loadFile(
      join(distDirectory, "audioCapture", "index.html"),
      {
        query: {
          inputDeviceLabel: settings.inputDeviceLabel ?? "",
          sampleRate: String(pcAudioFormat.sampleRate),
          channels: String(pcAudioFormat.channels),
        },
      },
    )
  }

  const scheduleRetry = (settings: PcAudioSettings) => {
    const generation = current.generation
    clearTimeout(current.retryTimer)
    current.retryTimer = setTimeout(() => {
      if (generation === current.generation) {
        void start(settings)
      }
    }, retryDelay)
  }

  ipcMain.on(capturePcmChannel, (event, pcm: unknown) => {
    if (
      !isFromCaptureWindow(event.sender.id) ||
      !(
        pcm instanceof ArrayBuffer ||
        ArrayBuffer.isView(pcm)
      )
    ) {
      return
    }
    current.packetizer?.push(
      pcm instanceof ArrayBuffer
        ? new Uint8Array(pcm)
        : new Uint8Array(
            pcm.buffer,
            pcm.byteOffset,
            pcm.byteLength,
          ),
    )
  })

  ipcMain.on(
    captureStatusChannel,
    (event, status: CaptureStatus) => {
      if (
        !isFromCaptureWindow(event.sender.id) ||
        current.settings === null
      ) {
        return
      }
      const settings = current.settings
      if (status.kind === "capturing") {
        log(
          `Sending "${status.sourceLabel}" to ${settings.host}:${settings.port} as VBAN stream "${settings.streamName}".`,
        )
        setStatus({
          kind: "sending",
          sourceLabel: String(status.sourceLabel).slice(
            0,
            200,
          ),
          destination: `${settings.host}:${settings.port}`,
        })
        return
      }
      log(`Audio capture failed: ${String(status.message)}`)
      setStatus({
        kind: "failed",
        message: String(status.message).slice(0, 300),
      })
      scheduleRetry(settings)
    },
  )

  /** Start, restart, or stop sending to match the settings. */
  const apply = (settings: PcAudioSettings) => {
    if (settings.isSending) {
      void start(settings)
      return
    }
    current.generation += 1
    current.settings = null
    closeCapture()
    if (current.status.kind !== "off") {
      setStatus({ kind: "off" })
    }
  }

  return {
    apply,
    readStatus: () => current.status,
    stop: () => {
      current.generation += 1
      closeCapture()
    },
  }
}
