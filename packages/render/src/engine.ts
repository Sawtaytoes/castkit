import type { ReactElement } from "react"

/**
 * A render request: a view element and the panel geometry to render it at.
 * `supersampleFactor` renders the element larger than native so the dither
 * pipeline's Lanczos downscale can bake in anti-aliasing (Decision 2).
 */
export type RenderRequest = {
  element: ReactElement
  width: number
  height: number
  supersampleFactor: number
}

/**
 * A render engine turns a view element into a full-colour PNG at
 * `width × supersampleFactor` by `height × supersampleFactor`. The two
 * implementations (Chromium, Satori) are interchangeable so the bake-off can
 * run the same view through both and compare fidelity + preview parity.
 */
export type RenderEngine = {
  name: "chromium" | "satori"
  render: (request: RenderRequest) => Promise<Buffer>
}
