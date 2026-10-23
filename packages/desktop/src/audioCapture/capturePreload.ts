// The hidden audio-capture page's preload. The page is a local file the app
// ships; this bridge is all it can reach, and the main process accepts its
// messages only from the capture window it opened.
import { contextBridge, ipcRenderer } from "electron"
import {
  capturePcmChannel,
  captureStatusChannel,
} from "../ipcChannels.ts"
import type {
  CaptureRequest,
  CastkitCaptureApi,
} from "./captureApi.ts"

// The main process passes the request in the page's query string, which is
// how `loadFile` hands a local page its arguments.
const readRequest = (): CaptureRequest => {
  const query = new URLSearchParams(window.location.search)
  const label = query.get("inputDeviceLabel")
  return {
    inputDeviceLabel:
      label === null || label === "" ? null : label,
    sampleRate: Number(query.get("sampleRate")),
    channels: Number(query.get("channels")),
  }
}

const api: CastkitCaptureApi = {
  readRequest,
  sendPcm: (pcm) => {
    ipcRenderer.send(capturePcmChannel, pcm)
  },
  reportStatus: (status) => {
    ipcRenderer.send(captureStatusChannel, status)
  },
}

contextBridge.exposeInMainWorld("castkitCapture", api)
