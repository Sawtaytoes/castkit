import type { Meta, StoryObj } from "@storybook/preact-vite"
import {
  buildCutter,
  buildCuttingJob,
  buildRecentJobs,
  LETTERS_PREVIEW,
} from "../__fixtures__/buildCutters.ts"
import { CutterStatus } from "../views/CutterStatus.tsx"
import { BROWSER_DEVICE_PROFILES } from "./deviceProfiles.ts"
import "../styles.css"

/*
 * Read once, at import. The preview freezes the clock before any story module
 * loads under automation, so the `vrt` capture always reads the same
 * countdown; a person opening the Storybook watches it run down.
 */
const NOW_MILLIS = Date.now()

const meta: Meta<typeof CutterStatus> = {
  title: "Views/Cutter Status",
  component: CutterStatus,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story, context) => {
      document.documentElement.dataset.scheme = "dark"
      return (
        <div
          style={{
            width: `${context.parameters.panelWidth ?? 1280}px`,
            height: `${context.parameters.panelHeight ?? 720}px`,
            position: "relative",
          }}
        >
          <Story />
        </div>
      )
    },
  ],
  args: {
    data: {
      cutters: [
        buildCutter({
          nowMillis: NOW_MILLIS,
          currentJob: buildCuttingJob({
            nowMillis: NOW_MILLIS,
          }),
        }),
      ],
    },
  },
}
export default meta
type Story = StoryObj<typeof CutterStatus>

export const Cutting: Story = {}

export const Sending: Story = {
  args: {
    data: {
      cutters: [
        buildCutter({
          nowMillis: NOW_MILLIS,
          currentJob: {
            ...buildCuttingJob({ nowMillis: NOW_MILLIS }),
            status: "sent",
            writtenAtMs: undefined,
            expectedDoneAtMs: undefined,
          },
        }),
      ],
    },
  },
}

export const Waiting: Story = {
  args: {
    data: {
      cutters: [
        buildCutter({
          nowMillis: NOW_MILLIS,
          currentJob: {
            ...buildCuttingJob({ nowMillis: NOW_MILLIS }),
            status: "queued",
            writtenAtMs: undefined,
            expectedDoneAtMs: undefined,
          },
        }),
      ],
    },
  },
}

/** The cutter reports nothing at the end, so the finish is Cuttero's estimate. */
export const FinishedEstimated: Story = {
  args: {
    data: {
      cutters: [
        buildCutter({
          nowMillis: NOW_MILLIS,
          recentJobs: [
            {
              ...buildCuttingJob({
                nowMillis: NOW_MILLIS,
                remainingSeconds: -120,
              }),
              status: "done",
              finishedAtMs: NOW_MILLIS - 120_000,
            },
            ...buildRecentJobs(NOW_MILLIS),
          ],
        }),
      ],
    },
  },
}

export const Failed: Story = {
  args: {
    data: {
      cutters: [
        buildCutter({
          nowMillis: NOW_MILLIS,
          recentJobs: [
            {
              id: "job-letters-retry",
              name: "Window letters",
              status: "failed",
              isTrace: false,
              createdAtMs: NOW_MILLIS - 60_000,
              finishedAtMs: NOW_MILLIS - 55_000,
              estimateSeconds: 61,
              cutLengthMm: 1_310,
              problemText:
                "The cutter did not take the job. Check that it is on.",
              preview: LETTERS_PREVIEW,
            },
            ...buildRecentJobs(NOW_MILLIS),
          ],
        }),
      ],
    },
  },
}

export const Ready: Story = {
  args: {
    data: {
      cutters: [buildCutter({ nowMillis: NOW_MILLIS })],
    },
  },
}

export const NotConnected: Story = {
  args: {
    data: {
      cutters: [
        buildCutter({
          nowMillis: NOW_MILLIS,
          isCutterConnected: false,
        }),
      ],
    },
  },
}

export const Offline: Story = {
  args: {
    data: {
      cutters: [
        buildCutter({
          nowMillis: NOW_MILLIS,
          isOnline: false,
          isCutterConnected: false,
          updatedAtMs: NOW_MILLIS - 3 * 60 * 60_000,
        }),
      ],
    },
  },
}

export const TwoCutters: Story = {
  args: {
    data: {
      cutters: [
        buildCutter({
          nowMillis: NOW_MILLIS,
          currentJob: buildCuttingJob({
            nowMillis: NOW_MILLIS,
          }),
        }),
        buildCutter({
          nowMillis: NOW_MILLIS,
          id: "cutter-2",
          name: "Second Cutter",
          hostLabel: "Garage PC",
        }),
      ],
    },
  },
}

export const WaitingForData: Story = {
  args: { data: null },
}

export const NoCutters: Story = {
  args: { data: { cutters: [] } },
}

const panelStory = (id: string) => {
  const profile = BROWSER_DEVICE_PROFILES.find(
    (device) => device.id === id,
  )
  return {
    parameters: {
      panelWidth: profile?.width,
      panelHeight: profile?.height,
    },
  }
}
export const MediaControls = panelStory("media-controls")
export const Workbench = panelStory("workbench")
export const Porthole = panelStory("porthole")
export const PiTouchPortrait = panelStory(
  "pi-touch-portrait",
)
