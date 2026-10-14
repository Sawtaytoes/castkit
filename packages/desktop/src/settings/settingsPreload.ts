// The settings window's preload. The settings page is a local file the app
// ships, and this bridge is the only thing it can reach. Every request is
// validated again in the main process.
import { contextBridge, ipcRenderer } from "electron"
import {
  addWindowChannel,
  highlightDisplayChannel,
  openWindowChannel,
  readPagesChannel,
  readSettingsChannel,
  removeWindowChannel,
  saveServerOriginChannel,
  scanServersChannel,
  settingsChangedChannel,
} from "../ipcChannels.ts"
import type { CastkitDesktopApi } from "./settingsApi.ts"

const api: CastkitDesktopApi = {
  readSettings: () =>
    ipcRenderer.invoke(readSettingsChannel),
  readPages: () => ipcRenderer.invoke(readPagesChannel),
  saveServerOrigin: (input) =>
    ipcRenderer.invoke(saveServerOriginChannel, input),
  scanForServers: () =>
    ipcRenderer.invoke(scanServersChannel),
  addWindow: (request) =>
    ipcRenderer.invoke(addWindowChannel, request),
  openWindow: (windowId) =>
    ipcRenderer.invoke(openWindowChannel, windowId),
  removeWindow: (windowId) =>
    ipcRenderer.invoke(removeWindowChannel, windowId),
  highlightDisplay: (displayId) => {
    ipcRenderer.send(highlightDisplayChannel, displayId)
  },
  watchSettings: (onChange) => {
    const listener = () => {
      onChange()
    }
    ipcRenderer.on(settingsChangedChannel, listener)
    return () => {
      ipcRenderer.off(settingsChangedChannel, listener)
    }
  },
}

contextBridge.exposeInMainWorld("castkitDesktop", api)
