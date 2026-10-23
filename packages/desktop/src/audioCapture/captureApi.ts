/** What the hidden capture page captures: everything this computer plays, or one input device. */
export type CaptureRequest = {
  /** The input device's label, or `null` for this computer's whole output. */
  inputDeviceLabel: string | null
  sampleRate: number
  channels: number
}

/** What the capture page tells the main process about its capture. */
export type CaptureStatus =
  | { kind: "capturing"; sourceLabel: string }
  | { kind: "failed"; message: string }

/** The bridge the capture preload puts on `window.castkitCapture`. */
export type CastkitCaptureApi = {
  readRequest: () => CaptureRequest
  /** One chunk of interleaved 16-bit PCM, whole sample frames. */
  sendPcm: (pcm: ArrayBuffer) => void
  reportStatus: (status: CaptureStatus) => void
}
