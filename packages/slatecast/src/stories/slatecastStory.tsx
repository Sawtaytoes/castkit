import type {
  BrowserDeviceProfile,
  ViewDataState,
} from "@castkit/shared/protocol/ws"
import type {
  Decorator,
  Meta,
  StoryObj,
} from "@storybook/preact-vite"
import { HttpResponse, http } from "msw"
import {
  buildAgenda,
  buildNowPlaying,
  buildQueue,
  buildWeather,
} from "../__fixtures__/buildSnapshot.ts"
import { App } from "../App.tsx"
import {
  MEDIA_CONTROLS_PROFILE,
  PORTHOLE_PROFILE,
} from "./deviceProfiles.ts"
import { seedSlatecastState } from "./seedSlatecastState.ts"

/**
 * Slatecast stories render the real `<App>` root against seeded module state.
 * Every story needs two things: a viewport sized to the panel (slatecast lays
 * out in `vmin`/`vw`/`vh`, so only a matching viewport is faithful) and the
 * signals re-seeded on every render (module state is global and would leak
 * between stories otherwise).
 *
 * A story declares what it wants under `parameters.slatecast`; the shared
 * decorator seeds from it. `view` is fixed per file (one file per view).
 */

/** The mock view data a fully-populated panel shows. */
export const FULL_VIEW_DATA: ViewDataState = {
  nowPlaying: buildNowPlaying(),
  queue: buildQueue(),
  weather: buildWeather(),
  agenda: buildAgenda(),
}

export type SlatecastStoryParameters = {
  device: BrowserDeviceProfile
  data: ViewDataState
}

const buildViewportParameters = (
  device: BrowserDeviceProfile,
) => ({
  viewport: {
    options: {
      panel: {
        name: device.label,
        styles: {
          width: `${device.width}px`,
          height: `${device.height}px`,
        },
      },
    },
  },
  initialGlobals: {
    viewport: { value: "panel", isRotated: false },
  },
})

/**
 * A handler for the PhotoFrame's `/d/<id>/photo` endpoint, answering with one
 * of the shared sample photos so the view paints a real image.
 */
export const buildPhotoHandlers = (photoPath: string) => [
  http.get("*/d/:deviceId/photo", async () => {
    const response = await fetch(photoPath)
    const body = await response.arrayBuffer()
    return HttpResponse.arrayBuffer(body, {
      headers: { "Content-Type": "image/jpeg" },
    })
  }),
]

/**
 * A decorator that seeds the module state for a given view before rendering.
 * Exported (rather than wrapped in a meta factory) because Storybook's CSF
 * indexer requires each story file's default export to be a literal object —
 * a `buildMeta(...)` call cannot be statically analysed.
 */
export const seedDecorator =
  (view: string): Decorator =>
  (Story, context) => {
    const slatecast = context.parameters
      .slatecast as SlatecastStoryParameters
    seedSlatecastState({
      device: slatecast.device,
      view,
      data: slatecast.data,
    })
    return <Story />
  }

/** The `<App>` root render every view story uses. */
export const renderApp = () => <App />

export type { Meta }

/**
 * The square + round device stories for a view. `data` defaults to a fully
 * populated panel; pass an emptier set to exercise a view's no-data state.
 */
export const buildDeviceStories = ({
  data = FULL_VIEW_DATA,
  photoHandlerPath,
}: {
  data?: ViewDataState
  photoHandlerPath?: string
} = {}): Record<string, StoryObj> => {
  const mswParameters = photoHandlerPath
    ? {
        msw: {
          handlers: buildPhotoHandlers(photoHandlerPath),
        },
      }
    : {}

  return {
    MediaControls: {
      name: "Media Controls (720×720 square)",
      parameters: {
        ...buildViewportParameters(MEDIA_CONTROLS_PROFILE),
        ...mswParameters,
        slatecast: {
          device: MEDIA_CONTROLS_PROFILE,
          data,
        },
      },
    },
    Porthole: {
      name: "Porthole (480×480 round)",
      parameters: {
        ...buildViewportParameters(PORTHOLE_PROFILE),
        ...mswParameters,
        slatecast: { device: PORTHOLE_PROFILE, data },
      },
    },
  }
}
