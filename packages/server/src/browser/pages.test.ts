import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import {
  __resetSlatecastBuildIdForTests,
  buildDevicePageHtml,
  resolveSlatecastBuildId,
} from "./pages.ts"

/**
 * The page shell is the FIRST paint. A kiosk panel holds its page for weeks, so
 * a rule keyed on a panel fact has to be able to read that fact before the
 * bundle has parsed — which is what these attributes are for.
 */
const buildSnapshot = ({
  orientation = 0,
  pixelGrid = "rgb-stripe",
  repaint = "instant",
}: {
  orientation?: 0 | 90 | 180 | 270
  pixelGrid?: "none" | "rgb-stripe" | "bgr-stripe"
  repaint?: "instant" | "fast" | "slow" | "super-slow"
} = {}) =>
  ({
    type: "snapshot",
    device: {
      id: "dev",
      label: "Dev",
      width: 720,
      height: 720,
      shape: "square",
      hasTouch: true,
      hasViewDrawer: false,
      color: "full",
      delivery: "live-browser",
      repaint,
      hasPanelDithering: false,
      pixelGrid,
      externalViews: [],
      views: [
        { name: "Now Playing", clientId: "now-playing" },
      ],
    },
    settings: {
      orientation,
      theme: "Dark",
      photoIntervalMinutes: 10,
    },
    view: "now-playing",
    data: {},
  }) as const

describe("buildDevicePageHtml", () => {
  test("stamps the Axis A panel facts on the root element", () => {
    const html = buildDevicePageHtml({
      snapshot: buildSnapshot({ repaint: "fast" }),
    })

    expect(html).toContain('data-repaint="fast"')
    expect(html).toContain('data-panel-dithering="false"')
    expect(html).toContain('data-pixel-grid="rgb-stripe"')
  })

  test("names the delivery and the input the model uses", () => {
    const html = buildDevicePageHtml({
      snapshot: buildSnapshot(),
    })

    expect(html).toContain('data-delivery="live-browser"')
    expect(html).toContain('data-input="touch"')
  })

  /*
   * `vw`/`vh`/`vmin` resolve against the viewport, which is the panel only
   * while the panel is hung straight. These carry the real layout box.
   */
  test("carries the layout box as custom properties", () => {
    const html = buildDevicePageHtml({
      snapshot: buildSnapshot(),
    })

    expect(html).toContain("--panel-width: 720px")
    expect(html).toContain("--panel-height: 720px")
    expect(html).toContain("--panel-min: 720px")
  })

  test("a usable stripe hung straight keeps subpixel text", () => {
    expect(
      buildDevicePageHtml({ snapshot: buildSnapshot() }),
    ).toContain('data-grayscale-text="false"')
  })

  /*
   * The derived attribute is the point of stamping one at all. Neither half of
   * this is readable from a single attribute: the panel has a stripe, and the
   * unit is hung sideways, so the stripe runs the other way from the one
   * Chromium assumes.
   */
  test("a stripe hung sideways forces grayscale text", () => {
    expect(
      buildDevicePageHtml({
        snapshot: buildSnapshot({ orientation: 90 }),
      }),
    ).toContain('data-grayscale-text="true"')
  })

  test("a panel with no stripe forces grayscale text", () => {
    expect(
      buildDevicePageHtml({
        snapshot: buildSnapshot({ pixelGrid: "none" }),
      }),
    ).toContain('data-grayscale-text="true"')
  })
})

/**
 * The id that decides whether a panel is running the bundle this server is
 * serving. A live-browser panel holds one page across many deploys, so this is
 * the only thing that can tell the two apart.
 */
describe("resolveSlatecastBuildId", () => {
  const writeBundle = ({
    js,
    css,
  }: {
    js: string
    css: string
  }) => {
    const distDir = mkdtempSync(
      join(tmpdir(), "castkit-build-id-"),
    )
    mkdirSync(join(distDir, "assets"), { recursive: true })
    writeFileSync(join(distDir, "assets/slatecast.js"), js)
    writeFileSync(
      join(distDir, "assets/slatecast.css"),
      css,
    )
    return distDir
  }

  const readBuildIdFor = (distDir: string) => {
    process.env.SLATECAST_DIST_DIR = distDir
    __resetSlatecastBuildIdForTests()
    return resolveSlatecastBuildId()
  }

  afterEach(() => {
    delete process.env.SLATECAST_DIST_DIR
    __resetSlatecastBuildIdForTests()
  })

  test("changes when the bundle's bytes change", () => {
    const before = readBuildIdFor(
      writeBundle({ js: "old", css: "shared" }),
    )
    const after = readBuildIdFor(
      writeBundle({ js: "new", css: "shared" }),
    )

    expect(before).not.toBe(after)
  })

  test("is the same for two builds with identical bytes", () => {
    const first = readBuildIdFor(
      writeBundle({ js: "same", css: "same" }),
    )
    const second = readBuildIdFor(
      writeBundle({ js: "same", css: "same" }),
    )

    // A restart of the same build must not reload every panel in the house.
    expect(first).toBe(second)
  })

  test("reads the bundle once", () => {
    const distDir = writeBundle({
      js: "first",
      css: "first",
    })
    const first = readBuildIdFor(distDir)
    writeFileSync(
      join(distDir, "assets/slatecast.js"),
      "second",
    )

    // The dist directory is baked into the image, so re-hashing it on every
    // page load and reconnect would be cost with no possible payoff.
    expect(resolveSlatecastBuildId()).toBe(first)
  })

  test("is a constant when there is no build to hash", () => {
    process.env.SLATECAST_DIST_DIR = join(
      tmpdir(),
      "castkit-build-id-missing",
    )
    __resetSlatecastBuildIdForTests()

    // "Cannot tell" has to read as "do not reload", never as a new build.
    expect(resolveSlatecastBuildId()).toBe("unknown")
  })
})
