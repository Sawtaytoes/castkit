import type { ViewName } from "@castkit/shared/views/viewNames"
import { VIEW_NAMES } from "@castkit/shared/views/viewNames"
import { AgendaView } from "@castkit/views/AgendaView"
import { ClockAgendaView } from "@castkit/views/ClockAgendaView"
import { ClockView } from "@castkit/views/ClockView"
import { ClockWeatherView } from "@castkit/views/ClockWeatherView"
import { NowPlayingDashboard } from "@castkit/views/NowPlayingDashboard"
import { NowPlayingPoster } from "@castkit/views/NowPlayingPoster"
import { PhotoAgendaView } from "@castkit/views/PhotoAgendaView"
import { PhotoFrameView } from "@castkit/views/PhotoFrameView"
import type { PanelViewProps } from "@castkit/views/viewProps"
import type { ReactElement } from "react"
import { pickPhotoForPanel } from "../stories/__fixtures__/samplePhotos.ts"
import {
  buildAgendaEventsFixture,
  buildClockStringsFixture,
  buildNowPlayingFixture,
  buildWeatherFixture,
  getIsCompactPanel,
  NO_AGENDA_EVENTS,
} from "../stories/__fixtures__/viewFixtures.ts"

/**
 * Every view the server can render, as a builder the stories can call with any
 * panel. This deliberately mirrors `renderViewElement` in
 * `@castkit/server/views/registry` — same view for the same name, same compact
 * /long string choice per panel height — with fixtures standing in for the
 * data Home Assistant would push.
 *
 * It is a parallel implementation, which is a real cost, but the alternative is
 * importing the server into a browser bundle. `storyViewCatalog.test.ts` keeps
 * the two honest by asserting this covers exactly `VIEW_NAMES`.
 */

export type StoryViewOptions = PanelViewProps & {
  /** Render the empty state where the view has one (the agenda views). */
  isEmpty?: boolean
  /** Photo URL for the photo-frame family; omitted renders the placeholder. */
  photoUrl?: string
}

type StoryViewBuilder = (
  options: StoryViewOptions,
) => ReactElement

const buildPanel = ({
  width,
  height,
  colorMode,
}: PanelViewProps) => ({ width, height, colorMode })

const buildPhotoView = ({
  width,
  height,
  colorMode,
  photoUrl,
}: StoryViewOptions) => (
  <PhotoFrameView
    {...buildPanel({ width, height, colorMode })}
    photoDataUri={
      photoUrl ?? pickPhotoForPanel({ width, height }).url
    }
  />
)

const STORY_VIEW_BUILDERS: Record<
  ViewName,
  StoryViewBuilder
> = {
  Clock: ({ width, height, colorMode }) => (
    <ClockView
      {...buildPanel({ width, height, colorMode })}
      {...buildClockStringsFixture(height)}
    />
  ),

  "Clock (Weather)": ({ width, height, colorMode }) => (
    <ClockWeatherView
      {...buildPanel({ width, height, colorMode })}
      {...buildClockStringsFixture(height)}
      {...buildWeatherFixture()}
    />
  ),

  "Clock (Agenda)": ({
    width,
    height,
    colorMode,
    isEmpty,
  }) => (
    <ClockAgendaView
      {...buildPanel({ width, height, colorMode })}
      {...buildClockStringsFixture(height)}
      {...buildWeatherFixture()}
      events={
        isEmpty
          ? NO_AGENDA_EVENTS
          : buildAgendaEventsFixture(height)
      }
    />
  ),

  Agenda: ({ width, height, colorMode, isEmpty }) => (
    <AgendaView
      {...buildPanel({ width, height, colorMode })}
      date={buildClockStringsFixture(height).date}
      {...buildWeatherFixture()}
      events={
        isEmpty
          ? NO_AGENDA_EVENTS
          : buildAgendaEventsFixture(height)
      }
      emptyText="Nothing else today"
    />
  ),

  "Photo Frame (Agenda)": ({
    width,
    height,
    colorMode,
    isEmpty,
    photoUrl,
  }) => (
    <PhotoAgendaView
      {...buildPanel({ width, height, colorMode })}
      photoDataUri={
        photoUrl ??
        pickPhotoForPanel({
          width: Math.floor(width / 2),
          height,
        }).url
      }
      date={buildClockStringsFixture(height).date}
      {...buildWeatherFixture()}
      events={
        isEmpty
          ? NO_AGENDA_EVENTS
          : buildAgendaEventsFixture(height)
      }
      emptyText="Nothing else today"
    />
  ),

  "Now Playing (Poster)": ({
    width,
    height,
    colorMode,
  }) => (
    <NowPlayingPoster
      {...buildPanel({ width, height, colorMode })}
      {...buildNowPlayingFixture()}
    />
  ),

  "Now Playing (Dashboard)": ({
    width,
    height,
    colorMode,
  }) => (
    <NowPlayingDashboard
      {...buildPanel({ width, height, colorMode })}
      {...buildNowPlayingFixture()}
      {...buildClockStringsFixture(height)}
    />
  ),

  // The three full-photo views paint the same component; only the server-side
  // adapter differs (letterbox / fill / dual portrait), so the preview shows
  // the same render with a photo suited to the panel's orientation.
  "Photo Frame": buildPhotoView,
  "Photo Frame (Fill)": buildPhotoView,
  "Photo Frame (Duo)": buildPhotoView,
}

/** Build the element for a view name on a given panel. */
export const buildStoryView = ({
  viewName,
  ...options
}: StoryViewOptions & { viewName: ViewName }) =>
  STORY_VIEW_BUILDERS[viewName](options)

/** Every view name, in the order the stories present them. */
export const STORY_VIEW_NAMES: readonly ViewName[] =
  VIEW_NAMES

/** Views with a meaningful empty state worth its own story. */
export const EMPTY_CAPABLE_VIEW_NAMES: readonly ViewName[] =
  ["Clock (Agenda)", "Agenda", "Photo Frame (Agenda)"]

export { getIsCompactPanel }
