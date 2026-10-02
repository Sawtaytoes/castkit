import type { ContractData } from "@castkit/sdk/contracts"
import type {
  Decorator,
  StoryObj,
} from "@storybook/preact-vite"
import {
  aiUsageFixture,
  compositionFixture,
  kidsPointsFixture,
  pointsHistoryFixture,
} from "./fixtures.ts"
import { PinKeypad } from "./PinKeypad.tsx"
import { DisplayComposition } from "./PlatformApp.tsx"
import type { DisplaySnapshot } from "./protocol.ts"
import "../styles.css"
import "./platform.css"

/**
 * Stamps the story's scheme on `<html>`, where the server stamps it on a real
 * display. The palette variables (`--bg`, `--fg`, …) are declared on `:root`
 * and resolve there, so a `data-scheme` on the story's own `<main>` flips the
 * Charcuterie tokens under it and leaves every palette variable light — the
 * dashboard rendered light, with its dark progress text on a dark track.
 */
const withDocumentScheme: Decorator = (Story, context) => {
  const scheme = context.parameters.scheme as
    | string
    | undefined
  if (scheme) {
    document.documentElement.dataset.scheme = scheme
  } else {
    delete document.documentElement.dataset.scheme
  }
  return <Story />
}

const meta = {
  title: "Views/Composed Dashboard",
  parameters: { layout: "fullscreen", scheme: "dark" },
  decorators: [withDocumentScheme],
}
export default meta
type Story = StoryObj<typeof meta>

/**
 * A root-relative path to a Storybook static file. A card takes only a path
 * that starts with `/`, and this Storybook is served at `/` on localhost but
 * at `/refs/castkit-slatecast/` inside the composed site, so the path is
 * resolved against the document rather than written out.
 */
const staticPath = (file: string) =>
  new URL(file, document.baseURI).pathname

/**
 * The composition fixture with pictures that load: an invented plate render
 * and an invented chamber-camera frame from `scripts/printer-fixture-images/`.
 * The unit tests keep the fixture's own paths; only the story swaps them.
 */
const fixturePrints = compositionFixture.channels.prints
if (!fixturePrints) {
  throw new Error(
    "The composition fixture lost its prints channel.",
  )
}
const fixturePrinters = (
  fixturePrints.data as ContractData["printers.v1"]
).printers

const storySnapshot: DisplaySnapshot = {
  ...compositionFixture,
  channels: {
    ...compositionFixture.channels,
    prints: {
      ...fixturePrints,
      data: {
        printers: fixturePrinters.map((printer) => ({
          ...printer,
          thumbnailPath: staticPath(
            "sample-photos/printer-plate-stand.png",
          ),
          cameraPath: staticPath(
            "sample-photos/printer-camera-chamber.jpg",
          ),
        })),
      },
    },
  },
}
/** Two independent channels share one responsive composition. */
export const PrintersAndRips: Story = {
  render: () => (
    <main class="platform">
      <DisplayComposition
        snapshot={storySnapshot}
        isConnected
        onAction={async () => undefined}
      />
    </main>
  ),
}
/** One printer beside another panel, using measured section priorities. */
export const PrintersWide: Story = {
  render: () => (
    <main class="platform">
      <DisplayComposition
        snapshot={
          {
            ...storySnapshot,
            channels: {
              ...storySnapshot.channels,
              prints: {
                ...storySnapshot.channels.prints,
                data: {
                  printers:
                    (
                      storySnapshot.channels.prints?.data as
                        | ContractData["printers.v1"]
                        | undefined
                    )?.printers.slice(0, 1) ?? [],
                },
              },
            },
          } as DisplaySnapshot
        }
        isConnected
        onAction={async () => undefined}
      />
    </main>
  ),
}
/**
 * Three printers on a 1400x640 window, each with a tall plate cover: the row
 * is the panel's height and every picture shrinks to fit, so the facts stay
 * above the fold. Before 2026-09-28 the covers set the row and the panel
 * scrolled. The badge counts the columns; the name carries no "1 - " prefix.
 */
export const PrintersThree: Story = {
  render: () => (
    <main class="platform">
      <DisplayComposition
        snapshot={
          {
            ...storySnapshot,
            view: {
              ...storySnapshot.view,
              name: "3D Printers",
              layout: "single",
              panels: storySnapshot.view.panels.filter(
                (panel) =>
                  panel.specId === "printer-status",
              ),
            },
            channels: {
              ...storySnapshot.channels,
              prints: {
                ...storySnapshot.channels.prints,
                data: {
                  printers: [
                    "Magi",
                    "Foopie",
                    "Quadrahedron",
                  ].map((name, index) => ({
                    ...(
                      storySnapshot.channels.prints?.data as
                        | ContractData["printers.v1"]
                        | undefined
                    )?.printers[0],
                    id: String(index + 1),
                    name,
                    percent: [41, 3, 64][index],
                  })),
                },
              },
            },
          } as DisplaySnapshot
        }
        isConnected
        onAction={async () => undefined}
      />
    </main>
  ),
}
/**
 * The Working screen's first tab: an active-only view. Both the rip deck and
 * the printer have something going on, so both regions show.
 */
export const WorkingNowBothActive: Story = {
  render: () => (
    <main class="platform">
      <DisplayComposition
        snapshot={{
          ...storySnapshot,
          view: {
            ...storySnapshot.view,
            name: "Now",
            isActiveOnly: true,
          },
          panelActivity: { printers: true, discs: true },
        }}
        isConnected
        onAction={async () => undefined}
      />
    </main>
  ),
}
/**
 * The same tab with the rip tower off: its region is gone and the printer
 * takes the width.
 */
export const WorkingNowPrinterOnly: Story = {
  render: () => (
    <main class="platform">
      <DisplayComposition
        snapshot={{
          ...storySnapshot,
          view: {
            ...storySnapshot.view,
            name: "Now",
            isActiveOnly: true,
          },
          panelActivity: { printers: true, discs: false },
        }}
        isConnected
        onAction={async () => undefined}
      />
    </main>
  ),
}
/** Every plate cleared and no rip running: the tab says so in one line. */
export const WorkingNowNothingActive: Story = {
  render: () => (
    <main class="platform">
      <DisplayComposition
        snapshot={{
          ...storySnapshot,
          view: {
            ...storySnapshot.view,
            name: "Now",
            isActiveOnly: true,
          },
          panelActivity: { printers: false, discs: false },
        }}
        isConnected
        onAction={async () => undefined}
      />
    </main>
  ),
}
/**
 * The Now tab with a music panel whose track is paused. The server keeps a
 * paused track active for ten minutes after a real stop, so the panel stays
 * and its Play button resumes the track in place.
 */
const workingNowWithPausedMusic = (
  isMusicActive: boolean,
): DisplaySnapshot => ({
  ...storySnapshot,
  view: {
    ...storySnapshot.view,
    name: "Now",
    isActiveOnly: true,
    panels: [
      ...storySnapshot.view.panels,
      {
        id: "music",
        specId: "now-playing",
        bindings: { data: "music" },
        settings: {},
      },
    ],
  },
  channels: {
    ...storySnapshot.channels,
    music: {
      id: "music",
      type: "now-playing.v1",
      data: {
        title: "Track One",
        artist: "Artist One",
        album: "Album One",
        isPlaying: false,
        positionSeconds: 84,
        durationSeconds: 212,
      },
      status: "ready",
    },
  },
  panelActivity: {
    printers: true,
    discs: false,
    music: isMusicActive,
  },
})
/** Paused less than ten minutes ago: the paused track stays beside the printer. */
export const WorkingNowMusicPaused: Story = {
  render: () => (
    <main class="platform">
      <DisplayComposition
        snapshot={workingNowWithPausedMusic(true)}
        isConnected
        onAction={async () => undefined}
      />
    </main>
  ),
}
/** Ten minutes after the pause the room is given back: the music panel goes. */
export const WorkingNowMusicPausedTenMinutesAgo: Story = {
  render: () => (
    <main class="platform">
      <DisplayComposition
        snapshot={workingNowWithPausedMusic(false)}
        isConnected
        onAction={async () => undefined}
      />
    </main>
  ),
}
/** The keypad works without a hardware keyboard. */
export const Locked: Story = {
  render: () => (
    <PinKeypad
      name="Private display"
      error=""
      isPending={false}
      onUnlock={async () => undefined}
    />
  ),
}
/** Connection loss preserves status but disables actions. */
export const Disconnected: Story = {
  render: () => (
    <main class="platform">
      <p role="status">Connection lost · Retrying</p>
      <DisplayComposition
        snapshot={storySnapshot}
        isConnected={false}
        onAction={async () => undefined}
      />
    </main>
  ),
}
/** Every AI subscription's remaining quota on one panel. */
export const AiUsage: Story = {
  render: () => (
    <main class="platform">
      <DisplayComposition
        snapshot={aiUsageFixture}
        isConnected
        onAction={async () => undefined}
      />
    </main>
  ),
}

/**
 * A printer in trouble tints its whole card on the face. The card keeps its
 * padding so the tint reads as a card and not as a bleed behind the job box,
 * and the filament row shows what the active tray is feeding.
 */
export const PrintersProblem: Story = {
  render: () => (
    <main class="platform">
      <DisplayComposition
        snapshot={
          {
            ...storySnapshot,
            channels: {
              ...storySnapshot.channels,
              prints: {
                ...storySnapshot.channels.prints,
                data: {
                  printers:
                    (
                      storySnapshot.channels.prints?.data as
                        | ContractData["printers.v1"]
                        | undefined
                    )?.printers.map((printer, index) =>
                      index === 0
                        ? {
                            ...printer,
                            state: "paused" as const,
                            problemText:
                              "Printer reports: 0x20005",
                          }
                        : printer,
                    ) ?? [],
                },
              },
            },
          } as DisplaySnapshot
        }
        isConnected
        onAction={async () => undefined}
      />
    </main>
  ),
}

/**
 * Tally Marks on a panel wide enough for every child side by side: each card
 * is the child's total against the goal, striped in their color.
 */
export const KidsPointsBoard: Story = {
  render: () => (
    <main class="platform">
      <DisplayComposition
        snapshot={kidsPointsFixture({ hasScan: false })}
        isConnected
        onAction={async () => undefined}
      />
    </main>
  ),
}
/**
 * A card scan three seconds ago: the child who scanned is outlined and
 * carries the result, and the rest of the board dims but stays.
 */
export const KidsPointsScan: Story = {
  render: () => (
    <main class="platform">
      <DisplayComposition
        snapshot={kidsPointsFixture({ hasScan: true })}
        isConnected
        onAction={async () => undefined}
      />
    </main>
  ),
}

const printerOnly = (
  isCameraVisible: boolean,
): DisplaySnapshot => ({
  ...storySnapshot,
  view: {
    ...storySnapshot.view,
    name: isCameraVisible
      ? "3D Printers and Cameras"
      : "3D Printers",
    layout: "single",
    panels: storySnapshot.view.panels
      .filter((panel) => panel.specId === "printer-status")
      .map((panel) => ({
        ...panel,
        settings: { isCameraVisible },
      })),
  },
})

/** Camera area chooses the orientation; resize the canvas in either axis. */
export const PrinterCamera: Story = {
  render: () => (
    <main class="platform">
      <DisplayComposition
        snapshot={printerOnly(true)}
        isConnected
        onAction={async () => undefined}
      />
    </main>
  ),
}

/** A static preview gives the live stats priority over enlarging the cover. */
export const PrinterStaticImage: Story = {
  render: () => (
    <main class="platform">
      <DisplayComposition
        snapshot={printerOnly(false)}
        isConnected
        onAction={async () => undefined}
      />
    </main>
  ),
}

const settledPrinterSnapshot = (
  state: "finished" | "failed",
): DisplaySnapshot => ({
  ...printerOnly(true),
  channels: {
    ...storySnapshot.channels,
    prints: {
      ...fixturePrints,
      data: {
        printers: fixturePrinters.map((printer) => ({
          ...printer,
          state,
          percent:
            state === "finished" ? 100 : printer.percent,
          cameraPath: staticPath(
            "sample-photos/printer-camera-chamber.jpg",
          ),
        })),
      },
    },
  },
})

/** Finished jobs keep their camera and plate-clear action until acknowledged. */
export const PrinterCameraFinished: Story = {
  render: () => (
    <main class="platform">
      <DisplayComposition
        snapshot={settledPrinterSnapshot("finished")}
        isConnected
        onAction={async () => undefined}
      />
    </main>
  ),
}

/** Failed jobs also hold the plate-clear gate, with danger styling. */
export const PrinterCameraFailed: Story = {
  render: () => (
    <main class="platform">
      <DisplayComposition
        snapshot={settledPrinterSnapshot("failed")}
        isConnected
        onAction={async () => undefined}
      />
    </main>
  ),
}

/** The producer supplies the same history to either delivery mode. */
export const PointsHistory: Story = {
  render: () => (
    <main class="platform">
      <DisplayComposition
        snapshot={pointsHistoryFixture()}
        isConnected
        onAction={async () => undefined}
      />
    </main>
  ),
}
/** Historical accumulation is distinct from lifetime and spendable balances. */
export const PointsCumulative: Story = {
  render: () => (
    <main class="platform">
      <DisplayComposition
        snapshot={pointsHistoryFixture("cumulative")}
        isConnected
        onAction={async () => undefined}
      />
    </main>
  ),
}
/** Completed task time uses minute deltas rather than daily cumulative minutes. */
export const PointsTaskTime: Story = {
  render: () => (
    <main class="platform">
      <DisplayComposition
        snapshot={pointsHistoryFixture("minutes")}
        isConnected
        onAction={async () => undefined}
      />
    </main>
  ),
}

const combinedSnapshot = (
  count: number,
): DisplaySnapshot => ({
  ...storySnapshot,
  view: {
    ...storySnapshot.view,
    id: "combined",
    name: "Combined kiosk",
    layout: "adaptive",
    isActiveOnly: true,
    panels: [
      {
        ...storySnapshot.view.panels[0],
        settings: { title: "", isCompactFacts: true },
      },
      {
        ...storySnapshot.view.panels[1],
        settings: { title: "", presentation: "posters" },
      },
      {
        ...aiUsageFixture.view.panels[0],
        settings: {
          title: "",
          isPositiveUsageOnly: true,
          isAlertReplacementEnabled: true,
          alertPercent: 80,
        },
      },
    ],
  },
  channels: {
    ...storySnapshot.channels,
    ...aiUsageFixture.channels,
    prints: {
      ...fixturePrints,
      data: {
        printers: Array.from(
          { length: count },
          (_unused, index) => ({
            ...fixturePrinters[0],
            id: `printer-${index}`,
            name: `Printer ${index + 1}`,
            cameraPath: staticPath(
              "sample-photos/printer-camera-chamber.jpg",
            ),
          }),
        ),
      },
    },
    rips: {
      ...compositionFixture.channels.rips,
      id: "rips",
      type: "rip-deck.v1",
      status: "ready",
      data: {
        ...(compositionFixture.channels.rips
          ?.data as ContractData["rip-deck.v1"]),
        bays: (
          compositionFixture.channels.rips
            ?.data as ContractData["rip-deck.v1"]
        ).bays.map((bay) => ({
          ...bay,
          posterUrl: staticPath(
            "sample-photos/portrait-face.jpg",
          ),
        })),
      },
    },
  },
})

/** One printer gets the camera rail; supporting accounts stack within their own region. */
export const CombinedOnePrinter: Story = {
  render: () => (
    <main class="platform">
      <DisplayComposition
        snapshot={combinedSnapshot(1)}
        isConnected
        onAction={async () => undefined}
      />
    </main>
  ),
}

/** Several individual printer cards share a composition with poster art and usage. */
export const CombinedThreePrinters: Story = {
  render: () => (
    <main class="platform">
      <DisplayComposition
        snapshot={combinedSnapshot(3)}
        isConnected
        onAction={async () => undefined}
      />
    </main>
  ),
}

/** State colors fill the padded outer surface of each independently composed printer. */
export const CombinedPrinterStates: Story = {
  render: () => {
    const snapshot = combinedSnapshot(3)
    const channel = snapshot.channels.prints
    if (!channel)
      throw new Error("Missing fixture printer channel")
    const printers = (
      channel.data as ContractData["printers.v1"]
    ).printers
    return (
      <main class="platform">
        <DisplayComposition
          snapshot={{
            ...snapshot,
            channels: {
              ...snapshot.channels,
              prints: {
                ...channel,
                data: {
                  printers: printers.map(
                    (printer, index) => ({
                      ...printer,
                      state:
                        index === 0
                          ? "paused"
                          : index === 2
                            ? "finished"
                            : "printing",
                      problemText:
                        index === 1
                          ? "Printer needs attention"
                          : undefined,
                    }),
                  ),
                },
              },
            },
          }}
          isConnected
          onAction={async () => undefined}
        />
      </main>
    )
  },
}

/** Three printers keep progress and controls whole while lower-priority usage shrinks. */
export const CombinedPrintersAndUsage: Story = {
  render: () => {
    const snapshot = combinedSnapshot(3)
    return (
      <main class="platform">
        <DisplayComposition
          snapshot={{
            ...snapshot,
            view: {
              ...snapshot.view,
              panels: snapshot.view.panels.filter(
                (panel) => panel.specId !== "rip-deck",
              ),
            },
          }}
          isConnected
          onAction={async () => undefined}
        />
      </main>
    )
  },
}
