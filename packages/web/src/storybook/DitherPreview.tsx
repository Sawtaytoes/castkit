import type { DitherAlgorithm } from "@castkit/core/devices/device"
import type { Palette } from "@castkit/core/panels/palette"
import { quantizeRgbaToPalette } from "@castkit/core/pipeline/quantize"
import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react"
import {
  paintPixelsToCanvas,
  rasterizePanel,
} from "./rasterizePanel.ts"

/**
 * Shows what a panel will actually paint: rasterizes the live view, quantizes
 * it with `@castkit/core`'s shared quantizer — the very code the server
 * dithers with, not a lookalike — and draws the result at native size.
 *
 * This matters most for a panel with no hardware dithering. The Inky pHAT and
 * Impression re-dither whatever they are sent, so their output is forgiving;
 * the M5Paper paints our pixels exactly as delivered, and until now there was
 * no way to see that anywhere but on the glass.
 *
 * `"off"` is not a dither — it means "ship full colour and let the panel's own
 * controller handle it" — so it is rendered as the undithered source.
 */
export type DitherPreviewProps = {
  width: number
  height: number
  palette: Palette
  algorithm: DitherAlgorithm
  supersampleFactor: number
  zoom: number
  rotation: number
  isShownAsMounted: boolean
  children: ReactNode
}

export const DitherPreview = ({
  width,
  height,
  palette,
  algorithm,
  supersampleFactor,
  zoom,
  rotation,
  isShownAsMounted,
  children,
}: DitherPreviewProps) => {
  const sourceRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [errorMessage, setErrorMessage] = useState<
    string | null
  >(null)
  const [isRendering, setIsRendering] = useState(true)

  useEffect(() => {
    const sourceNode = sourceRef.current
    const canvas = canvasRef.current
    if (!sourceNode || !canvas) {
      return
    }

    // Runs are SERIALIZED. The rasterizer is not safe to run twice over the same
    // node concurrently, and there are two triggers (mount, then the cropped
    // photo's `<img>` swapping in), so a run in flight sets a rerun flag instead
    // of starting a second one — and the trailing run always reflects the final
    // DOM.
    const lifecycle = {
      isStale: false,
      isRunning: false,
      isRerunRequested: false,
    }
    setErrorMessage(null)

    const rasterizeOnce = async () => {
      setIsRendering(true)
      const imageData = await rasterizePanel({
        node: sourceNode,
        width,
        height,
        supersampleFactor,
      })
      if (lifecycle.isStale) {
        return
      }

      const pixels =
        algorithm === "off"
          ? imageData.data
          : quantizeRgbaToPalette({
              rgbaPixels: imageData.data,
              width,
              height,
              palette,
              algorithm,
            })

      paintPixelsToCanvas({ canvas, pixels, width, height })
    }

    const runSerialized = async () => {
      if (lifecycle.isRunning) {
        lifecycle.isRerunRequested = true
        return
      }
      lifecycle.isRunning = true
      try {
        await rasterizeOnce()
        while (
          lifecycle.isRerunRequested &&
          !lifecycle.isStale
        ) {
          lifecycle.isRerunRequested = false
          await rasterizeOnce()
        }
      } catch (error: unknown) {
        if (!lifecycle.isStale) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : String(error),
          )
        }
      } finally {
        lifecycle.isRunning = false
        if (!lifecycle.isStale) {
          setIsRendering(false)
        }
      }
    }

    // Re-rasterize whenever a descendant image loads — the photo is cropped
    // asynchronously and swaps its `<img>` src in after the first paint. `load`
    // does not bubble, so listen in the capture phase.
    const onDescendantLoad = () => {
      void runSerialized()
    }
    sourceNode.addEventListener(
      "load",
      onDescendantLoad,
      true,
    )
    void runSerialized()

    return () => {
      lifecycle.isStale = true
      sourceNode.removeEventListener(
        "load",
        onDescendantLoad,
        true,
      )
    }
  }, [width, height, palette, algorithm, supersampleFactor])

  return (
    <div>
      {/*
        The raster source: a real 1:1 mount, off-screen. It must not be the
        zoomed node — scaling it would bake the zoom into the pixels.
      */}
      <div
        style={{
          position: "fixed",
          left: -10000,
          top: 0,
          width,
          height,
          pointerEvents: "none",
        }}
        aria-hidden="true"
      >
        <div ref={sourceRef} style={{ width, height }}>
          {children}
        </div>
      </div>

      <div
        style={{
          width: width * zoom,
          height: height * zoom,
          overflow: "hidden",
          opacity: isRendering ? 0.55 : 1,
          transition: "opacity 120ms",
        }}
      >
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          style={{
            width,
            height,
            // Nearest-neighbour, so a dithered pixel stays a pixel when zoomed
            // instead of being smoothed back into the greys it just removed.
            imageRendering: "pixelated",
            transform: `scale(${zoom})${
              isShownAsMounted
                ? ` rotate(${rotation}deg)`
                : ""
            }`,
            transformOrigin: "top left",
          }}
        />
      </div>

      {errorMessage ? (
        <p
          style={{
            fontFamily: "monospace",
            fontSize: 12,
            color: "#a00",
            margin: "8px 0 0",
          }}
        >
          Dither preview failed: {errorMessage}
        </p>
      ) : null}
    </div>
  )
}
