import type { DitherAlgorithm } from "@castkit/core/devices/device"
import {
  IMPRESSION_DEVICE,
  M5PAPER_DEVICE,
  PHAT_DEVICE,
} from "@castkit/core/devices/device"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { DitherPreview } from "../storybook/DitherPreview.tsx"
import { PanelStage } from "../storybook/PanelStage.tsx"
import {
  type PaletteVariant,
  resolvePalette,
} from "../storybook/panelCatalog.ts"
import {
  SAMPLE_PHOTO_LIST,
  SAMPLE_PHOTOS,
} from "./__fixtures__/samplePhotos.ts"

/**
 * Side-by-side dithering, run in the browser with `@castkit/core`'s own
 * quantizer — the same code the server dithers with, so what you compare here
 * is the real algorithm and not a lookalike.
 *
 * This matters most for the **M5Paper**. The Inky pHAT and Impression
 * re-dither whatever they are sent, so a mediocre choice still looks
 * acceptable on glass; the M5Paper paints our pixels exactly as delivered,
 * and until now the only way to compare algorithms for it was to flash the
 * device and walk over to look.
 *
 * Two caveats, stated plainly: the downscale here is canvas bilinear rather
 * than sharp's Lanczos3, and the rasterizer re-renders the DOM through an SVG
 * `foreignObject`. Both are close, neither is byte-identical to the device.
 * Treat this as a comparison tool, not a device simulator.
 */

const COMPARED_ALGORITHMS: readonly DitherAlgorithm[] = [
  "threshold",
  "ordered",
  "floyd-steinberg",
  "atkinson",
  "stucki",
  "sierra",
]

const CAPTION_STYLE = {
  fontFamily: "monospace",
  fontSize: 11,
  color: "#333",
  marginBottom: 4,
} as const

type ComparisonProps = {
  device: typeof PHAT_DEVICE
  photoUrl: string
  supersampleFactor?: number
  paletteVariant?: PaletteVariant
  zoom?: number
}

/** One row per algorithm, all quantizing the identical source render. */
const AlgorithmComparison = ({
  device,
  photoUrl,
  supersampleFactor = 2,
  paletteVariant = "default",
  zoom = 1,
}: ComparisonProps) => (
  <div
    style={{
      display: "flex",
      gap: 20,
      flexWrap: "wrap",
      alignItems: "flex-start",
      padding: 16,
      backgroundColor: "#ffffff",
    }}
  >
    {COMPARED_ALGORITHMS.map((algorithm) => (
      <figure key={algorithm} style={{ margin: 0 }}>
        <figcaption style={CAPTION_STYLE}>
          {algorithm} — {device.label} @ {supersampleFactor}
          ×
        </figcaption>
        <DitherPreview
          width={device.width}
          height={device.height}
          palette={resolvePalette({
            colourMode: device.colourMode,
            paletteVariant,
          })}
          algorithm={algorithm}
          supersampleFactor={supersampleFactor}
          zoom={zoom}
          rotation={device.rotation}
          isShownAsMounted={false}
        >
          <PanelStage
            viewName="Photo Frame"
            width={device.width}
            height={device.height}
            colourMode={device.colourMode}
            photoUrl={photoUrl}
          />
        </DitherPreview>
      </figure>
    ))}
  </div>
)

/** The same algorithm at each supersample factor, to show what it buys. */
const SupersampleComparison = ({
  device,
  photoUrl,
  algorithm,
}: {
  device: typeof PHAT_DEVICE
  photoUrl: string
  algorithm: DitherAlgorithm
}) => (
  <div
    style={{
      display: "flex",
      gap: 20,
      flexWrap: "wrap",
      alignItems: "flex-start",
      padding: 16,
      backgroundColor: "#ffffff",
    }}
  >
    {[1, 2, 3, 4].map((supersampleFactor) => (
      <figure key={supersampleFactor} style={{ margin: 0 }}>
        <figcaption style={CAPTION_STYLE}>
          {algorithm} @ {supersampleFactor}×
        </figcaption>
        <DitherPreview
          width={device.width}
          height={device.height}
          palette={resolvePalette({
            colourMode: device.colourMode,
            paletteVariant: "default",
          })}
          algorithm={algorithm}
          supersampleFactor={supersampleFactor}
          zoom={1}
          rotation={device.rotation}
          isShownAsMounted={false}
        >
          <PanelStage
            viewName="Photo Frame"
            width={device.width}
            height={device.height}
            colourMode={device.colourMode}
            photoUrl={photoUrl}
          />
        </DitherPreview>
      </figure>
    ))}
  </div>
)

const meta = {
  title: "Dither/Comparison",
  parameters: {
    layout: "fullscreen",
    controls: { disable: true },
  },
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

export const M5PaperEveryAlgorithm: Story = {
  name: "M5Paper mono — every algorithm",
  render: () => (
    <AlgorithmComparison
      device={M5PAPER_DEVICE}
      photoUrl={SAMPLE_PHOTOS.portraitFace.url}
    />
  ),
}

export const M5PaperColourSource: Story = {
  name: "M5Paper mono — a saturated colour photo",
  render: () => (
    <AlgorithmComparison
      device={M5PAPER_DEVICE}
      photoUrl={SAMPLE_PHOTOS.colour.url}
    />
  ),
}

export const M5PaperGradient: Story = {
  name: "M5Paper mono — a smooth gradient (banding)",
  render: () => (
    <AlgorithmComparison
      device={M5PAPER_DEVICE}
      photoUrl={SAMPLE_PHOTOS.gradient.url}
    />
  ),
}

export const ImpressionEveryAlgorithm: Story = {
  name: "Impression E6 — every algorithm",
  render: () => (
    <AlgorithmComparison
      device={IMPRESSION_DEVICE}
      photoUrl={SAMPLE_PHOTOS.colour.url}
    />
  ),
}

export const PhatEveryAlgorithm: Story = {
  name: "pHAT mono — every algorithm",
  render: () => (
    <AlgorithmComparison
      device={PHAT_DEVICE}
      photoUrl={SAMPLE_PHOTOS.highContrast.url}
      zoom={2}
    />
  ),
}

export const SupersampleFactors: Story = {
  name: "M5Paper — supersample 1× to 4×",
  render: () => (
    <SupersampleComparison
      device={M5PAPER_DEVICE}
      photoUrl={SAMPLE_PHOTOS.highContrast.url}
      algorithm="floyd-steinberg"
    />
  ),
}

export const EverySamplePhoto: Story = {
  name: "Every sample photo, Impression E6",
  render: () => (
    <div
      style={{
        display: "flex",
        gap: 20,
        flexWrap: "wrap",
        padding: 16,
        backgroundColor: "#ffffff",
      }}
    >
      {SAMPLE_PHOTO_LIST.map((photo) => (
        <figure key={photo.url} style={{ margin: 0 }}>
          <figcaption style={CAPTION_STYLE}>
            {photo.label}
          </figcaption>
          <DitherPreview
            width={IMPRESSION_DEVICE.width}
            height={IMPRESSION_DEVICE.height}
            palette={resolvePalette({
              colourMode: "e6",
              paletteVariant: "default",
            })}
            algorithm="floyd-steinberg"
            supersampleFactor={2}
            zoom={1}
            rotation={0}
            isShownAsMounted={false}
          >
            <PanelStage
              viewName="Photo Frame"
              width={IMPRESSION_DEVICE.width}
              height={IMPRESSION_DEVICE.height}
              colourMode="e6"
              photoUrl={photo.url}
            />
          </DitherPreview>
        </figure>
      ))}
    </div>
  ),
}
