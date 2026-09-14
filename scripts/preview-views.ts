import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { createChromiumEngine } from "@castkit/render/chromiumEngine"
import { AgendaView } from "@castkit/views/AgendaView"
import type { ClockAgendaEvent } from "@castkit/views/ClockAgendaView"
import { ClockAgendaView } from "@castkit/views/ClockAgendaView"
import { ClockWeatherView } from "@castkit/views/ClockWeatherView"
import { NowPlayingDashboard } from "@castkit/views/NowPlayingDashboard"
import { createElement, type ReactElement } from "react"
import sharp from "sharp"

/**
 * View-iteration preview: renders the dashboard, clock-weather and agenda
 * views through the Chromium engine at every real panel size with
 * representative data (including the awkward cases — no artist, marathon
 * YouTube Music titles, a day with more events than the glass holds) so layout
 * changes can be eyeballed as PNGs before touching a physical panel. Writes
 * `render-output/preview/<scenario>--<panel>.png` (gitignored).
 *
 * Run: `yarn tsx scripts/preview-views.ts`
 */

const SUPERSAMPLE_FACTOR = 2

const OUTPUT_DIRECTORY = join(
  process.cwd(),
  "render-output",
  "preview",
)

type PreviewPanel = {
  key: string
  width: number
  height: number
  colourMode: "mono" | "e6"
  /** Pre-formatted per-panel strings, as the server would supply them. */
  time: string
  date: string
  /**
   * More events than any panel here can hold. The agenda views trim to what
   * finishes on the glass, so this is what proves the trim rather than a
   * comfortable three.
   */
  events: readonly ClockAgendaEvent[]
}

/** Large-panel event rows, pre-formatted the way the server hands them over. */
const LARGE_PANEL_EVENTS: readonly ClockAgendaEvent[] = [
  { timeText: "12:00 PM", summary: "Piano lesson" },
  {
    timeText: "12:40 PM",
    summary: "Early childhood program pickup",
  },
  {
    timeText: "1:45 PM",
    summary: "Doctor's appointment",
  },
  {
    timeText: "3:15 PM",
    summary: "Pick up the dry cleaning",
  },
  {
    timeText: "6:00 PM",
    summary: "Dinner with the neighbours",
  },
]

const PANELS: readonly PreviewPanel[] = [
  {
    key: "phat-mono",
    width: 250,
    height: 122,
    colourMode: "mono",
    time: "12:45a",
    date: "Th-02",
    events: [
      { timeText: "12:00p", summary: "Piano lesson" },
      {
        timeText: "12:40p",
        summary: "Early childhood program pickup",
      },
      {
        timeText: "1:45p",
        summary: "Doctor's appointment",
      },
      {
        timeText: "3:15p",
        summary: "Pick up the dry cleaning",
      },
      {
        timeText: "6:00p",
        summary: "Dinner with the neighbours",
      },
    ],
  },
  {
    key: "impression-e6",
    width: 800,
    height: 480,
    colourMode: "e6",
    time: "12:45 AM",
    date: "Thursday, July 2",
    events: LARGE_PANEL_EVENTS,
  },
  {
    key: "m5paper-mono",
    width: 960,
    height: 540,
    colourMode: "mono",
    time: "12:58 AM",
    date: "Monday, September 14",
    events: LARGE_PANEL_EVENTS,
  },
]

/** A tiny solid-colour PNG data URI standing in for real album artwork. */
const buildArtworkDataUri = async () => {
  const pngBuffer = await sharp({
    create: {
      width: 64,
      height: 64,
      channels: 3,
      background: { r: 46, g: 96, b: 158 },
    },
  })
    .png()
    .toBuffer()

  return `data:image/png;base64,${pngBuffer.toString("base64")}`
}

type PreviewScenario = {
  key: string
  buildElement: ({
    panel,
  }: {
    panel: PreviewPanel
  }) => ReactElement
}

const buildScenarios = ({
  artworkDataUri,
}: {
  artworkDataUri: string
}): readonly PreviewScenario[] => [
  {
    key: "now-playing",
    buildElement: ({ panel }) =>
      createElement(NowPlayingDashboard, {
        width: panel.width,
        height: panel.height,
        colourMode: panel.colourMode,
        artist: "ALI PROJECT",
        title: "sekka zange shinjuu",
        album: "Kinsho",
        isPlaying: false,
        time: panel.time,
        date: panel.date,
      }),
  },
  {
    key: "now-playing-artwork",
    buildElement: ({ panel }) =>
      createElement(NowPlayingDashboard, {
        width: panel.width,
        height: panel.height,
        colourMode: panel.colourMode,
        artist: "ALI PROJECT",
        title: "sekka zange shinjuu",
        album: "Kinsho",
        isPlaying: false,
        time: panel.time,
        date: panel.date,
        artworkDataUri,
      }),
  },
  {
    key: "now-playing-long-title",
    buildElement: ({ panel }) =>
      createElement(NowPlayingDashboard, {
        width: panel.width,
        height: panel.height,
        colourMode: panel.colourMode,
        artist: "",
        title:
          "My Neighbor Totoro - Bedtime Music - Baby Music, Lullaby Music, Sleep Music",
        isPlaying: true,
        time: panel.time,
        date: panel.date,
      }),
  },
  {
    key: "now-playing-long-title-artwork",
    buildElement: ({ panel }) =>
      createElement(NowPlayingDashboard, {
        width: panel.width,
        height: panel.height,
        colourMode: panel.colourMode,
        artist: "—",
        title:
          "My Neighbor Totoro - Bedtime Music - Baby Music, Lullaby Music, Sleep Music",
        isPlaying: true,
        time: panel.time,
        date: panel.date,
        artworkDataUri,
      }),
  },
  {
    key: "clock-weather",
    buildElement: ({ panel }) =>
      createElement(ClockWeatherView, {
        width: panel.width,
        height: panel.height,
        colourMode: panel.colourMode,
        time: panel.time,
        date: panel.date,
        temperatureText: "79°",
        conditionText: "Partly cloudy",
      }),
  },
  {
    key: "clock-no-weather",
    buildElement: ({ panel }) =>
      createElement(ClockWeatherView, {
        width: panel.width,
        height: panel.height,
        colourMode: panel.colourMode,
        time: panel.time,
        date: panel.date,
      }),
  },
  {
    key: "clock-agenda",
    buildElement: ({ panel }) =>
      createElement(ClockAgendaView, {
        width: panel.width,
        height: panel.height,
        colourMode: panel.colourMode,
        time: panel.time,
        date: panel.date,
        temperatureText: "71°",
        conditionText: "Clear night",
        events: panel.events,
      }),
  },
  {
    key: "agenda",
    buildElement: ({ panel }) =>
      createElement(AgendaView, {
        width: panel.width,
        height: panel.height,
        colourMode: panel.colourMode,
        date: panel.date,
        temperatureText: "71°",
        conditionText: "Clear night",
        events: panel.events,
        emptyText: "Nothing else today",
      }),
  },
]

const run = async () => {
  await mkdir(OUTPUT_DIRECTORY, { recursive: true })

  const artworkDataUri = await buildArtworkDataUri()
  const scenarios = buildScenarios({ artworkDataUri })
  const chromiumEngine = await createChromiumEngine()

  const renderCombination = async ({
    scenario,
    panel,
  }: {
    scenario: PreviewScenario
    panel: PreviewPanel
  }) => {
    const pngBuffer = await chromiumEngine.render({
      element: scenario.buildElement({ panel }),
      width: panel.width,
      height: panel.height,
      supersampleFactor: SUPERSAMPLE_FACTOR,
    })

    const fileName = `${scenario.key}--${panel.key}.png`
    await writeFile(
      join(OUTPUT_DIRECTORY, fileName),
      pngBuffer,
    )
    console.log(`[preview] ${fileName}`)
  }

  try {
    const combinations = scenarios.flatMap((scenario) =>
      PANELS.map((panel) => ({ scenario, panel })),
    )

    await Promise.all(combinations.map(renderCombination))
  } finally {
    await chromiumEngine.close()
  }
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
