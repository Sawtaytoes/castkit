import { describe, expect, test } from "vitest"
import { page } from "vitest/browser"
import {
  buildDeviceProfile,
  buildSnapshot,
} from "../__fixtures__/buildSnapshot.ts"
import { mountSlatecast } from "../__tests__/setup/mountSlatecast.tsx"
// This file measures boxes against hit tests, so it needs the real rules.
import "../styles.css"

/**
 * A touch target's bounding box must BE its touch area.
 *
 * CastKit's remote-display renderer (`device-client/remote-display`) drives the
 * WT32 panel by screenshotting this SPA, sending the picture to the panel, and
 * replaying a reported finger position back into Chromium. It binds that touch
 * with two agreeing answers: `document.elementFromPoint` now, and the target
 * rectangles it recorded from `getBoundingClientRect()` in the frame the panel
 * is actually looking at. When the two disagree the touch is dropped, with no
 * feedback on the glass.
 *
 * A bounding rect cannot see a `::before` pad or an overflowing range-input
 * thumb. Both sliders drew one. Measured on the deployed page at 480x320 on
 * 2026-09-13, before the fix: the seek bar's box was 10 px inside a 39 px touch
 * area and the volume slider's was 10 px inside 27 px, so 74 % and 62 % of the
 * landings the browser accepted were thrown away. That is what the owner
 * reported as "touch controls working really erratically".
 *
 * These tests are the invariant, not the symptom. Any future enlarged hit area
 * has to be real box geometry to pass them.
 */

const SHORT_PANEL = { width: 480, height: 320 }
const SQUARE_PANEL = { width: 720, height: 720 }
const TARGET_ATTRIBUTE = "data-castkit-target"

type Target = {
  identity: string
  x: number
  y: number
  width: number
  height: number
}

const mountOnPanel = async ({
  width,
  height,
}: {
  width: number
  height: number
}) => {
  await page.viewport(width, height)
  await mountSlatecast({
    snapshot: buildSnapshot({
      view: "now-playing",
      device: buildDeviceProfile({
        width,
        height,
        hasTouch: true,
      }),
    }),
  })
  await document.fonts.ready
}

/** Exactly what `TARGETS_SCRIPT` in `worker.py` records. */
const recordedTargets = (
  width: number,
  height: number,
): Target[] =>
  Array.from(
    document.querySelectorAll(`[${TARGET_ATTRIBUTE}]`),
  )
    .filter((element) => {
      const bounds = element.getBoundingClientRect()
      return (
        bounds.width &&
        bounds.height &&
        bounds.left >= 0 &&
        bounds.top >= 0 &&
        bounds.right <= width &&
        bounds.bottom <= height &&
        !element.matches(':disabled,[aria-disabled="true"]')
      )
    })
    .map((element) => {
      const bounds = element.getBoundingClientRect()
      return {
        identity:
          element.getAttribute(TARGET_ATTRIBUTE) ?? "",
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      }
    })

/**
 * Exactly what `target_at` in `interaction.py` answers, with one pixel of
 * slack on the edge. A layout box lands on a fraction — the square's artwork
 * starts at y=42.6 — and the browser hit-tests the whole device pixel that
 * fraction sits in while an arithmetic comparison does not. That costs a
 * one-pixel band at a control's border and is not the fault under test; a pad
 * drawn on a pseudo-element costs fourteen.
 */
const EDGE_SLACK_PIXELS = 1

const targetAt = (
  targets: Target[],
  pointX: number,
  pointY: number,
) => {
  for (
    let index = targets.length - 1;
    index >= 0;
    index--
  ) {
    const target = targets[index]
    if (
      target.x - EDGE_SLACK_PIXELS <= pointX &&
      pointX <
        target.x + target.width + EDGE_SLACK_PIXELS &&
      target.y - EDGE_SLACK_PIXELS <= pointY &&
      pointY < target.y + target.height + EDGE_SLACK_PIXELS
    ) {
      return target.identity
    }
  }
  return null
}

/** Exactly what `HIT_SCRIPT` in `worker.py` answers. */
const browserTargetAt = (
  pointX: number,
  pointY: number,
) => {
  const element = document
    .elementFromPoint(pointX, pointY)
    ?.closest(`[${TARGET_ATTRIBUTE}]`)
  return element &&
    !element.matches(':disabled,[aria-disabled="true"]')
    ? (element.getAttribute(TARGET_ATTRIBUTE) ?? null)
    : null
}

const disagreements = (width: number, height: number) => {
  const targets = recordedTargets(width, height)
  const found: {
    pointX: number
    pointY: number
    recorded: string | null
    browser: string | null
  }[] = []
  for (let pointY = 0; pointY < height; pointY += 2) {
    for (let pointX = 0; pointX < width; pointX += 2) {
      const recorded = targetAt(targets, pointX, pointY)
      const browser = browserTargetAt(pointX, pointY)
      // A rounded corner can put a point inside the rectangle that the browser
      // hit-tests as outside; that direction only wastes a tap on nothing and
      // is not what this guards. The dropped-touch direction is the other one.
      if (browser !== null && recorded !== browser) {
        found.push({ pointX, pointY, recorded, browser })
      }
    }
  }
  return { targets, found }
}

describe.each([
  ["the 480x320 short panel", SHORT_PANEL],
  ["the 720x720 square", SQUARE_PANEL],
])("Now Playing touch targets on %s", (_label, panel) => {
  // The short panel overrides the vmin sizes in px; the square takes them from
  // the base rules. Both numbers are the finger pad the control draws.
  const isShortPanel = panel === SHORT_PANEL
  const vmin = Math.min(panel.width, panel.height) / 100
  const expectedSeekHeight = isShortPanel ? 38 : 10 * vmin
  const expectedVolumeHeight = isShortPanel
    ? 26
    : 5.5 * vmin

  test("every point the browser gives a control is inside that control's recorded box", async () => {
    await mountOnPanel(panel)

    const { targets, found } = disagreements(
      panel.width,
      panel.height,
    )

    expect(
      targets.map((target) => target.identity).sort(),
    ).toEqual([
      "now-playing-artwork",
      "now-playing-mute",
      "now-playing-seek",
      "now-playing-volume",
    ])
    expect(
      found
        .slice(0, 5)
        .map(
          ({ pointX, pointY, recorded, browser }) =>
            `(${pointX},${pointY}) recorded=${recorded} browser=${browser}`,
        ),
    ).toEqual([])
  })

  test("the seek bar and the volume slider are at least a finger tall", async () => {
    await mountOnPanel(panel)

    const targets = recordedTargets(
      panel.width,
      panel.height,
    )
    const heightOf = (identity: string) =>
      targets.find((target) => target.identity === identity)
        ?.height ?? 0

    // The pad the two controls draw for a finger: 4vmin above and below the
    // seek bar, and a thumb 5.5vmin across on the volume slider.
    expect(heightOf("now-playing-seek")).toBeCloseTo(
      expectedSeekHeight,
      0,
    )
    expect(heightOf("now-playing-volume")).toBeCloseTo(
      expectedVolumeHeight,
      0,
    )
  })
})
