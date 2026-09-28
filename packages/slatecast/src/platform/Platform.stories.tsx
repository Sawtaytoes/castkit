import type { ContractData } from "@castkit/sdk/contracts"
import type {
  Decorator,
  StoryObj,
} from "@storybook/preact-vite"
import {
  aiUsageFixture,
  compositionFixture,
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
/**
 * One printer on a wide panel: the card passes its 900 px breakpoint and puts
 * the picture on the left with the facts beside it. Shrink the canvas under
 * about 950 px and it stacks again. The breakpoint is the card's own width.
 */
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
