// The settings window's preload. The settings page is a local file the app
// ships, and this bridge is the only thing it can reach: three requests, each
// validated again in the main process.
import { contextBridge, ipcRenderer } from "electron"
import {
  addWindowChannel,
  readSettingsChannel,
  saveServerOriginChannel,
} from "../ipcChannels.ts"
import type { CastkitDesktopApi } from "./settingsApi.ts"

const api: CastkitDesktopApi = {
  readSettings: () =>
    ipcRenderer.invoke(readSettingsChannel),
  saveServerOrigin: (input) =>
    ipcRenderer.invoke(saveServerOriginChannel, input),
  addWindow: (request) =>
    ipcRenderer.invoke(addWindowChannel, request),
}

contextBridge.exposeInMainWorld("castkitDesktop", api)
