import { describe, expect, test } from "vitest"
import {
  getDefaultRepaint,
  getRepaintFactsForDevice,
  getViewsForDevice,
} from "./viewsForDevice.ts"

describe("getDefaultRepaint", () => {
  test("calls a browser device instant", () => {
    expect(
      getDefaultRepaint({ isBrowserDevice: true }),
    ).toBe("instant")
  })

  test("calls an http-pull panel fast", () => {
    expect(
      getDefaultRepaint({
        imageDelivery: "http-pull",
        colorMode: "monochrome",
      }),
    ).toBe("fast")
  })

  test("calls a multi-ink ePaper panel super-slow", () => {
    expect(
      getDefaultRepaint({ colorMode: "spectra6" }),
    ).toBe("super-slow")
  })

  test("calls a one-ink ePaper panel slow", () => {
    expect(
      getDefaultRepaint({ colorMode: "monochrome" }),
    ).toBe("slow")
  })

  test("lets an explicit grade win over the inference", () => {
    expect(
      getViewsForDevice({
        colorMode: "spectra6",
        repaint: "instant",
      }),
    ).toContain("Clock")
  })
})

describe("getViewsForDevice", () => {
  test("offers a super-slow panel no clock-bearing view", () => {
    // This is the live defect. The 28-second Impression was offered Clock,
    // Clock (Weather) and Clock (Agenda), and the minute ticker re-pushed it.
    const views = getViewsForDevice({
      colorMode: "spectra6",
    })

    expect(views).not.toContain("Clock")
    expect(views).not.toContain("Clock (Weather)")
    expect(views).not.toContain("Clock (Agenda)")
    expect(views).not.toContain("Now Playing (Dashboard)")
  })

  test("still offers a super-slow panel the agenda and photos", () => {
    const views = getViewsForDevice({
      colorMode: "spectra6",
    })

    expect(views).toEqual([
      "Photo Frame",
      "Photo Frame (Fill)",
      "Photo Frame (Duo)",
      "Agenda",
    ])
  })

  test("offers a slow mono panel its clock", () => {
    // A 3-second panel finishes well inside the minute, which is why the
    // Inky pHAT can carry a clock and the Impression cannot.
    expect(
      getViewsForDevice({ colorMode: "monochrome" }),
    ).toContain("Clock")
  })

  test("offers a browser panel everything", () => {
    expect(
      getViewsForDevice({ isBrowserDevice: true }),
    ).toEqual([
      "Now Playing (Dashboard)",
      "Now Playing (Poster)",
      "Photo Frame",
      "Photo Frame (Fill)",
      "Photo Frame (Duo)",
      "Clock",
      "Clock (Weather)",
      "Clock (Agenda)",
      "Agenda",
    ])
  })

  test("keeps the clock on a battery M5Paper", () => {
    // Battery drops fast -> slow, and slow still passes the freshness rule for
    // a clock minute. The reference doc used to claim the clock came off here.
    const views = getViewsForDevice({
      imageDelivery: "http-pull",
      colorMode: "monochrome",
      power: "battery",
    })

    expect(views).toContain("Clock")
  })

  test("takes the clock off a battery panel that was already slow", () => {
    // slow -> super-slow is where a grade drop actually changes the list.
    expect(
      getViewsForDevice({
        colorMode: "monochrome",
        power: "battery",
      }),
    ).not.toContain("Clock")
  })

  test("never returns an empty list", () => {
    const views = getViewsForDevice({
      repaint: "super-slow",
      power: "battery",
    })

    expect(views.length).toBeGreaterThan(0)
  })
})

describe("getRepaintFactsForDevice", () => {
  /*
   * One reader for two call sites — the discovery `select` and the minute
   * re-push. They are the same question asked twice, and a panel offered a
   * view the ticker then refuses to re-push is a panel showing a clock that
   * never moves. Before this existed both sites spelled the object out, and
   * both would have had to be edited to add a fact.
   */
  test("carries every fact the grade depends on", () => {
    expect(
      getRepaintFactsForDevice({
        colorMode: "spectra6",
        imageDelivery: "http-pull",
        power: "battery",
        repaint: "slow",
      }),
    ).toEqual({
      colorMode: "spectra6",
      imageDelivery: "http-pull",
      power: "battery",
      repaint: "slow",
    })
  })

  test("a panel that declares nothing carries nothing", () => {
    expect(
      getRepaintFactsForDevice({ colorMode: "monochrome" }),
    ).toEqual({
      colorMode: "monochrome",
      imageDelivery: undefined,
      power: undefined,
      repaint: undefined,
    })
  })
})

describe("a battery install is graded one step slower", () => {
  /*
   * ⚠️ This does NOT take the clock off the M5Paper, and the reference doc
   * used to claim it did. `fast` and `slow` offer the same list, because a
   * 3-second panel still passes the freshness rule for a clock minute — which
   * is the whole reason the Inky pHAT can show one. What a battery install
   * really buys is fewer repaints per day, which is a budget and not a filter.
   */
  test("an unplugged M5Paper keeps its clock", () => {
    const wired = getViewsForDevice({
      colorMode: "monochrome",
      imageDelivery: "http-pull",
      power: "wired",
    })
    const onBattery = getViewsForDevice({
      colorMode: "monochrome",
      imageDelivery: "http-pull",
      power: "battery",
    })

    expect(onBattery).toEqual(wired)
    expect(onBattery).toContain("Clock")
  })

  test("a slow panel on a cell loses the clock", () => {
    const wired = getViewsForDevice({
      colorMode: "monochrome",
      power: "wired",
    })
    const onBattery = getViewsForDevice({
      colorMode: "monochrome",
      power: "battery",
    })

    expect(wired).toContain("Clock")
    expect(onBattery).not.toContain("Clock")
    expect(onBattery).toContain("Agenda")
  })

  /*
   * An explicit grade is the panel's own fact and the install still applies on
   * top of it. A `super-slow` panel cannot be dropped further — there is no
   * slower grade, and returning nothing would leave the display unreachable
   * from Home Assistant.
   */
  test("an explicit grade still drops a step, and the floor holds", () => {
    expect(
      getViewsForDevice({
        power: "battery",
        repaint: "super-slow",
      }),
    ).toEqual(
      getViewsForDevice({
        power: "wired",
        repaint: "super-slow",
      }),
    )
  })
})
