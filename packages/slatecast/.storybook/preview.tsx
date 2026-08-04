import type { Preview } from "@storybook/preact-vite"
import { setupWorker } from "msw/browser"
import { mswLoader } from "msw-storybook-addon/csf3"
import "../src/styles.css"

/*
  Slatecast's PhotoFrame fetches `/d/<id>/photo` over HTTP, so stories need that
  endpoint mocked with MSW's service worker (generated into `public/`). The
  photo story supplies its own handler in `parameters.msw`.
*/
const preview: Preview = {
  parameters: {
    layout: "fullscreen",
  },
  /**
   * A **custom** MSW setup, for one reason: the service worker has to register
   * RELATIVE TO THIS STORYBOOK, not the origin root.
   *
   * The addon's default is `/mockServiceWorker.js` at scope `/`, which is
   * correct when a Storybook *is* the site. This one is not: `storybook.octen.dev`
   * composes it as a ref under `/refs/castkit-slatecast/`, where a root
   * `/mockServiceWorker.js` does not exist — every story then renders the
   * "component failed to render" panel with *"Service Worker script does not
   * exist at the given path"*. It passed locally the whole time, because
   * locally the ref is served at `/`.
   *
   * `url` and `scope` resolve against the preview document (`…/iframe.html`), so
   * `./` is whatever prefix the site mounts this Storybook at — the identical
   * build works at localhost, at a devshare hostname, and at the composed
   * subpath. The scope is narrower than the app's `/d/<id>/photo` request path,
   * which is fine: a worker intercepts requests from the clients it CONTROLS
   * (the preview iframe, under `./`), not by URL prefix. This mirrors
   * gallery-downloader's Storybook, which hit and documented the same wall.
   */
  loaders: [
    mswLoader(async () => {
      const worker = setupWorker()
      await worker.start({
        onUnhandledRequest: "bypass",
        quiet: true,
        serviceWorker: {
          options: { scope: "./" },
          url: "./mockServiceWorker.js",
        },
      })
      return worker
    }),
  ],
}

export default preview
