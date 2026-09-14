import type {
  BrowserDeviceProfile,
  ViewDataState,
} from "@castkit/shared/protocol/ws"
import type {
  Decorator,
  Meta,
  StoryContext,
  StoryObj,
} from "@storybook/preact-vite"
import {
  buildAgenda,
  buildNowPlaying,
  buildQueue,
  buildWeather,
} from "../__fixtures__/buildSnapshot.ts"
import { App } from "../App.tsx"
import { __setPhotoUrlBuilderForStories } from "../photoSource.ts"
import { BROWSER_DEVICE_PROFILES } from "./deviceProfiles.ts"
import {
  isPanelDocument,
  PanelFrame,
} from "./panelFrame.tsx"
import { seedSlatecastState } from "./seedSlatecastState.ts"

/**
 * Slatecast stories render the real `<App>` root against seeded module state.
 * Every story needs two things: a document sized to the panel (slatecast lays
 * out in `vmin`/`vw`/`vh`, so only a matching viewport is faithful) and the
 * signals re-seeded on every render (module state is global and would leak
 * between stories otherwise).
 *
 * A story declares what it wants under `parameters.slatecast`; the shared
 * decorator seeds from it. `view` is fixed per file (one file per view). The
 * panel-sized document comes from `panelFrame.tsx` — read its note for why the
 * Storybook viewport preset could not do that job.
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

/**
 * Sample photos, served by Storybook as static files from the repo's shared
 * `assets/sample-photos` (see `.storybook/main.ts`). The paths are RELATIVE,
 * so they resolve against whatever prefix this Storybook is mounted at —
 * `/` at localhost, `/refs/castkit-slatecast/` inside the composed site.
 *
 * These are plain files rather than a mocked endpoint on purpose. The previous
 * version answered the app's real image URLs with a Mock Service Worker, and a
 * service worker has to register, activate and claim the page before the first
 * `<img>` fires; when it loses that race the view shows its empty state and
 * the story reads as broken. A static file cannot lose a race.
 */
const SAMPLE_PHOTOS = {
  landscape: "sample-photos/landscape-colour.jpg",
  landscapeAlternate:
    "sample-photos/landscape-gradient.jpg",
  portrait: "sample-photos/portrait-face.jpg",
  portraitAlternate:
    "sample-photos/portrait-face-second.jpg",
} as const

/**
 * The album art the Now Playing stories show. A landscape sunset rather than
 * one of the portraits: cropped square it reads as cover art, where a stranger's
 * face reads as a photo somebody pasted in by mistake.
 */
export const STORY_ARTWORK_PATH =
  SAMPLE_PHOTOS.landscapeAlternate

/**
 * Point the Photo Frame at a sample photo that suits the panel's shape, and
 * alternate between two of them so the rotation counter visibly does
 * something. A portrait panel showing a landscape crop would misrepresent the
 * only thing this view does.
 */
const seedPhotoSource = (device: BrowserDeviceProfile) => {
  const isPortrait = device.height > device.width
  const photos = isPortrait
    ? [
        SAMPLE_PHOTOS.portrait,
        SAMPLE_PHOTOS.portraitAlternate,
      ]
    : [
        SAMPLE_PHOTOS.landscape,
        SAMPLE_PHOTOS.landscapeAlternate,
      ]
  __setPhotoUrlBuilderForStories(
    ({ rotationCounter }) =>
      photos[rotationCounter % photos.length] as string,
  )
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
    seedPhotoSource(slatecast.device)
    seedSlatecastState({
      device: slatecast.device,
      view,
      data: slatecast.data,
    })
    return <Story />
  }

/**
 * The render every view story uses: the app itself inside the panel frame, or
 * — in the frame's own nested document — the app on its own.
 */
export const renderApp = (
  _args: unknown,
  context: StoryContext,
) => {
  if (isPanelDocument()) {
    return <App />
  }
  const { device } = context.parameters
    .slatecast as SlatecastStoryParameters
  return <PanelFrame device={device} storyId={context.id} />
}

export type { Meta }

/**
 * The story export name each panel gets, in every view file. The all-screens
 * matrix builds story ids from these, so they are a contract rather than a
 * label — Storybook lower-cases and hyphenates an export name to make the id.
 */
export const STORY_EXPORT_BY_DEVICE_ID: Record<
  string,
  string
> = {
  "media-controls": "MediaControls",
  "pi-touch-landscape": "PiTouchLandscape",
  "pi-touch-portrait": "PiTouchPortrait",
  porthole: "Porthole",
  workbench: "Workbench",
}

/**
 * One story per panel for a view. `data` defaults to a fully populated panel;
 * pass an emptier set to exercise a view's no-data state.
 *
 * Every panel gets a story, always. Photo Frame used to ship two of the five
 * and nobody could see what the view did on the short landscape panel, which
 * is the one panel whose layout differs.
 */
export const buildDeviceStories = ({
  data = FULL_VIEW_DATA,
}: {
  data?: ViewDataState
} = {}): Record<string, StoryObj> =>
  Object.fromEntries(
    BROWSER_DEVICE_PROFILES.map((device) => [
      STORY_EXPORT_BY_DEVICE_ID[device.id],
      {
        name: device.label,
        parameters: {
          slatecast: { data, device },
          // Kept so the story is also right when this Storybook is opened on
          // its own, where the toolbar's viewport list does reach it.
          viewport: {
            options: {
              panel: {
                name: device.label,
                styles: {
                  height: `${device.height}px`,
                  width: `${device.width}px`,
                },
              },
            },
          },
        },
      } satisfies StoryObj,
    ]),
  )
