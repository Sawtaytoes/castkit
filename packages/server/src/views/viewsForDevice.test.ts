import { describe, expect, test } from "vitest"
import {
  getDefaultRepaint,
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
