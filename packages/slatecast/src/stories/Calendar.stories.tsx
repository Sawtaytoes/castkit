import type { StoryObj } from "@storybook/preact-vite"
import { buildAgendaEvent } from "../__fixtures__/buildSnapshot.ts"
import {
  buildDeviceStories,
  FULL_VIEW_DATA,
  renderApp,
  seedDecorator,
} from "./slatecastStory.tsx"

const HOUR_MILLIS = 3_600_000

/**
 * A busy day. Two events never reached the bottom of any panel, so the stories
 * could not show where the view stops drawing rows. This one carries more rows
 * than the tallest panel holds, an all-day event, and one summary long enough
 * to need its ellipsis. Times are relative to the (frozen, under automation)
 * clock, like the fixture's own.
 */
const BUSY_DAY = [
  buildAgendaEvent({
    summary: "Recycling day",
    isAllDay: true,
    startMs: new Date(Date.now()).setHours(0, 0, 0, 0),
  }),
  buildAgendaEvent({
    summary: "Dentist appointment",
    startMs: Date.now() + HOUR_MILLIS,
  }),
  buildAgendaEvent({
    summary: "Grocery delivery",
    startMs: Date.now() + 2 * HOUR_MILLIS,
  }),
  buildAgendaEvent({
    summary:
      "Pick up the replacement parts for the dishwasher from the hardware store",
    startMs: Date.now() + 2.5 * HOUR_MILLIS,
  }),
  buildAgendaEvent({
    summary: "Swim lesson",
    startMs: Date.now() + 3 * HOUR_MILLIS,
  }),
  buildAgendaEvent({
    summary: "Call the plumber back",
    startMs: Date.now() + 3.5 * HOUR_MILLIS,
  }),
  buildAgendaEvent({
    summary: "Dinner with neighbors",
    startMs: Date.now() + 5 * HOUR_MILLIS,
  }),
  buildAgendaEvent({
    summary: "Book club",
    startMs: Date.now() + 6 * HOUR_MILLIS,
  }),
  buildAgendaEvent({
    summary: "Take the trash to the curb",
    startMs: Date.now() + 7 * HOUR_MILLIS,
  }),
]

const meta = {
  title: "Views/Calendar",
  render: renderApp,
  decorators: [seedDecorator("calendar")],
}

export default meta

type Story = StoryObj<typeof meta>

const deviceStories = buildDeviceStories({
  data: { ...FULL_VIEW_DATA, agenda: { events: BUSY_DAY } },
})

export const MediaControls: Story =
  deviceStories.MediaControls
export const Porthole: Story = deviceStories.Porthole
export const Workbench: Story = deviceStories.Workbench
export const PiTouchLandscape: Story =
  deviceStories.PiTouchLandscape
export const PiTouchPortrait: Story =
  deviceStories.PiTouchPortrait
