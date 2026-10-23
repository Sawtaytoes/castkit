// The hidden audio-capture page. It opens the audio the main process asked
// for, converts it to interleaved 16-bit PCM in an AudioWorklet, and hands
// each chunk to the main process, which cuts it into VBAN packets.
import type { CastkitCaptureApi } from "./captureApi.ts"

declare global {
  interface Window {
    castkitCapture: CastkitCaptureApi
  }
}

// The AudioWorklet scope's globals, which the DOM library does not declare.
declare class AudioWorkletProcessor {
  readonly port: MessagePort
}
declare const registerProcessor: (
  name: string,
  processor: typeof AudioWorkletProcessor,
) => void

// Runs inside the AudioWorklet's own scope, so it must be self-contained: it
// is turned into source text with `toString()`, and nothing it refers to
// outside its own body would exist there.
const pcmTapModule = () => {
  // About 10 ms at 48 kHz: few enough messages for the IPC, short enough
  // that the stream never stalls.
  const framesPerChunk = 480

  class PcmTap extends AudioWorkletProcessor {
    chunk = new Int16Array(framesPerChunk * 2)
    length = 0

    process(inputs: Float32Array[][]) {
      const channels = inputs[0] ?? []
      const left = channels[0]
      const right = channels[1] ?? left
      // No input channels means no audio this quantum; send silence so the
      // receiver's stream stays continuous.
      const frameCount = left?.length ?? 128
      for (let index = 0; index < frameCount; index += 1) {
        const leftSample = left?.[index] ?? 0
        const rightSample = right?.[index] ?? 0
        this.chunk[this.length] =
          Math.max(-1, Math.min(1, leftSample)) * 0x7fff
        this.chunk[this.length + 1] =
          Math.max(-1, Math.min(1, rightSample)) * 0x7fff
        this.length += 2
        if (this.length === this.chunk.length) {
          this.port.postMessage(this.chunk.buffer, [
            this.chunk.buffer,
          ])
          this.chunk = new Int16Array(framesPerChunk * 2)
          this.length = 0
        }
      }
      return true
    }
  }

  registerProcessor("castkit-pcm-tap", PcmTap)
}

const bridge = window.castkitCapture
const request = bridge.readRequest()

const openSystemAudio = async () => {
  // The main process answers this request with the system loopback. Chromium
  // insists on a video track as well; it is stopped at once.
  const stream =
    await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: true,
    })
  stream.getVideoTracks().forEach((track) => {
    track.stop()
  })
  if (stream.getAudioTracks().length === 0) {
    throw new Error(
      "The system did not share its audio output.",
    )
  }
  return {
    stream,
    sourceLabel: "everything this computer plays",
  }
}

const openInputDevice = async (label: string) => {
  const devices = (
    await navigator.mediaDevices.enumerateDevices()
  ).filter((device) => device.kind === "audioinput")
  const device = devices.find(
    (candidate) => candidate.label === label,
  )
  if (!device) {
    throw new Error(
      `The input "${label}" is not connected.`,
    )
  }
  // Every voice-call filter off: this is music, and the person wants it as
  // it is.
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: { exact: device.deviceId },
      channelCount: request.channels,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  })
  return { stream, sourceLabel: label }
}

const start = async () => {
  const { stream, sourceLabel } =
    request.inputDeviceLabel === null
      ? await openSystemAudio()
      : await openInputDevice(request.inputDeviceLabel)
  const context = new AudioContext({
    sampleRate: request.sampleRate,
  })
  const moduleUrl = URL.createObjectURL(
    new Blob([`(${pcmTapModule.toString()})()`], {
      type: "text/javascript",
    }),
  )
  await context.audioWorklet.addModule(moduleUrl)
  URL.revokeObjectURL(moduleUrl)
  const tap = new AudioWorkletNode(
    context,
    "castkit-pcm-tap",
    {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [request.channels],
      // Mixed to stereo before the tap, so a mono input reaches both sides.
      channelCount: request.channels,
      channelCountMode: "explicit",
      channelInterpretation: "speakers",
    },
  )
  tap.port.onmessage = (
    event: MessageEvent<ArrayBuffer>,
  ) => {
    bridge.sendPcm(event.data)
  }
  context.createMediaStreamSource(stream).connect(tap)
  // The tap writes nothing to its output. It is connected only so that the
  // audio graph keeps pulling it.
  tap.connect(context.destination)
  await context.resume()
  stream.getAudioTracks().forEach((track) => {
    track.addEventListener("ended", () => {
      bridge.reportStatus({
        kind: "failed",
        message: `The capture of "${sourceLabel}" stopped.`,
      })
    })
  })
  bridge.reportStatus({ kind: "capturing", sourceLabel })
}

start().catch((error: unknown) => {
  bridge.reportStatus({
    kind: "failed",
    message:
      error instanceof Error
        ? error.message
        : String(error),
  })
})
