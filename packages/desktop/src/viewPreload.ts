// Runs in every CastKit page window, sandboxed and isolated from the page. It
// exposes nothing to the page; it only watches which view the page shows and
// tells the main process, which applies that view's saved zoom.
//
// The page reports its view as `data-view`: on `main.platform` for `/screen`
// and `/view` pages, and on `.stage` for `/d/<id>` device pages.
import { ipcRenderer } from "electron"
import { viewChannel } from "./ipcChannels.ts"

const readActiveView = () =>
  document
    .querySelector("main.platform[data-view]")
    ?.getAttribute("data-view") ??
  document
    .querySelector(".stage[data-view]")
    ?.getAttribute("data-view") ??
  null

const reported = {
  view: undefined as string | null | undefined,
}

const reportActiveView = () => {
  const view = readActiveView()
  if (view === reported.view) {
    return
  }
  reported.view = view
  ipcRenderer.send(viewChannel, view)
}

window.addEventListener("DOMContentLoaded", () => {
  reportActiveView()
  new MutationObserver(reportActiveView).observe(
    document.documentElement,
    {
      attributes: true,
      attributeFilter: ["data-view"],
      childList: true,
      subtree: true,
    },
  )
})
