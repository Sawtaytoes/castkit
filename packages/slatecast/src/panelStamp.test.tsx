import { describe, expect, test } from "vitest"
import {
  buildDeviceProfile,
  buildSnapshot,
} from "./__fixtures__/buildSnapshot.ts"
import { mountSlatecast } from "./__tests__/setup/mountSlatecast.tsx"
// The rules under test live here. No other slatecast test loads the
// stylesheet, because no other one asserts on a computed style.
import "./styles.css"

/**
 * The panel stamp is only worth writing if a rule reads it. These tests run in
 * real Chromium against the real stylesheet, so they measure what the glass
 * gets rather than what the markup says.
 */

const artworkRail = () =>
  document.querySelector(".artwork-rail") as HTMLElement

describe("only an instant panel may animate", () => {
  test("an instant panel keeps its spring", async () => {
    await mountSlatecast({
      snapshot: buildSnapshot({
        device: buildDeviceProfile({ repaint: "instant" }),
      }),
    })

    expect(
      getComputedStyle(artworkRail()).transitionDuration,
    ).not.toBe("0s")
  })

  /*
   * On `fast` an animation is a stutter; below that it is a flicker. The rule
   * is a blanket override on <html>, so a view written next year inherits it
   * without its author having to know the rule exists.
   */
  test("a slower panel gets no transition at all", async () => {
    await mountSlatecast({
      snapshot: buildSnapshot({
        device: buildDeviceProfile({ repaint: "fast" }),
      }),
    })

    expect(
      getComputedStyle(artworkRail()).transitionDuration,
    ).toBe("0s")
  })
})

describe("text antialiasing follows the stripe", () => {
  test("a panel with no stripe antialiases in gray", async () => {
    await mountSlatecast({
      snapshot: buildSnapshot({
        device: buildDeviceProfile({ pixelGrid: "none" }),
      }),
    })

    expect(
      getComputedStyle(
        document.documentElement,
      ).getPropertyValue("-webkit-font-smoothing"),
    ).toBe("antialiased")
  })

  test("a usable stripe is left alone", async () => {
    await mountSlatecast({
      snapshot: buildSnapshot({
        device: buildDeviceProfile({
          pixelGrid: "rgb-stripe",
        }),
      }),
    })

    expect(
      getComputedStyle(
        document.documentElement,
      ).getPropertyValue("-webkit-font-smoothing"),
    ).not.toBe("antialiased")
  })
})
