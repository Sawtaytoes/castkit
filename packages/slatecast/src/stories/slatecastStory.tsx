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
  WORKBENCH_PROFILE,
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

/** The artwork URL the Now Playing stories name; served by the handler below. */
export const STORY_ARTWORK_PATH = "/d/story/artwork.jpg"

/**
 * Handlers for the PhotoFrame's `/d/<id>/photo` endpoint and the Now Playing
 * artwork, answering with one of the shared sample photos so the view paints a
 * real image rather than the placeholder glyph.
 */
export const buildPhotoHandlers = (photoPath: string) => {
  const servePhoto = async () => {
    const response = await fetch(photoPath)
    const body = await response.arrayBuffer()
    return HttpResponse.arrayBuffer(body, {
      headers: { "Content-Type": "image/jpeg" },
    })
  }
  return [
    http.get("*/d/:deviceId/photo", servePhoto),
    http.get(STORY_ARTWORK_PATH, servePhoto),
  ]
}

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
 * The square + round + workbench device stories for a view. `data` defaults to a fully
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
    Workbench: {
      name: "Workbench (480×320 landscape)",
      parameters: {
        ...buildViewportParameters(WORKBENCH_PROFILE),
        ...mswParameters,
        slatecast: { device: WORKBENCH_PROFILE, data },
      },
    },
  }
}
