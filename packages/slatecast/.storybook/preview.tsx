import type { Preview } from "@storybook/preact-vite"
import { mswLoader } from "msw-storybook-addon/csf3"
import "../src/styles.css"

/*
  Slatecast's PhotoFrame fetches `/d/<id>/photo` over HTTP, so stories need that
  endpoint mocked. MSW's service worker (generated into `public/`) does it; the
  photo story supplies its own handler in `parameters.msw`.
*/
const preview: Preview = {
  parameters: {
    layout: "fullscreen",
  },
  loaders: [mswLoader()],
}

export default preview
