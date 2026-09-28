import { screen } from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { describe, expect, test, vi } from "vitest"
import {
  buildDeviceProfile,
  buildPrinterJob,
  buildSettings,
  buildSnapshot,
} from "../__fixtures__/buildSnapshot.ts"
import { mountSlatecast } from "../__tests__/setup/mountSlatecast.tsx"
import { waitUntil } from "../__tests__/setup/slatecastServer.ts"

/** A fixed 24-hour UTC clock, so the Finishes row reads "HH:MM" anywhere. */
const UTC_CLOCK = {
  timeZone: "UTC",
  isTwelveHour: false,
  isNumericDate: false,
}

const mountPrinterStatus = async (
  printers: ReturnType<typeof buildPrinterJob>[],
) =>
  mountSlatecast({
    snapshot: buildSnapshot({
      device: buildDeviceProfile({
        views: [
          {
            name: "Printer Status",
            clientId: "printer-status",
          },
          { name: "Clock", clientId: "clock" },
        ],
      }),
      settings: buildSettings({ clock: UTC_CLOCK }),
      view: "printer-status",
      data: { printers: { printers } },
    }),
  })

const cards = () =>
  document.querySelectorAll(".printer-card")

/**
 * The confirmation's commit button repeats the card button's word, so the
 * queries name the element by class. `getByRole` cannot separate them, and
 * giving the two different words would make the card button read as a
 * different action from the one it opens.
 */
const cardActions = (selector: string) =>
  Array.from(
    document.querySelectorAll<HTMLButtonElement>(
      `.printer-action${selector}`,
    ),
  )

const commitButton = () =>
  document.querySelector<HTMLButtonElement>(
    ".printer-confirm-commit",
  )

/**
 * A UTC wall-clock time on a day relative to the day the test runs. The
 * fixture clock is UTC, so a day offset here is the day offset the card
 * computes, whatever hour the suite happens to run at.
 */
const utcMillisOnDay = ({
  dayOffset,
  hour,
  minute,
}: {
  dayOffset: number
  hour: number
  minute: number
}) => {
  const now = new Date()
  return Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + dayOffset,
    hour,
    minute,
  )
}

describe("the printer cards", () => {
  test("gives every active printer a column", async () => {
    await mountPrinterStatus([
      buildPrinterJob(),
      buildPrinterJob({ id: "foopie", name: "Foopie" }),
      buildPrinterJob({
        id: "quad",
        name: "Quadrahedron",
      }),
    ])

    expect(cards()).toHaveLength(3)
    expect(
      document
        .querySelector(".printer-status")
        ?.getAttribute("data-count"),
    ).toBe("3")
  })

  test("shows the percentage, the layer and the shortened job name", async () => {
    await mountPrinterStatus([buildPrinterJob()])

    expect(screen.getByText("41%")).toBeVisible()
    expect(screen.getByText("32 / 334")).toBeVisible()
    expect(screen.getByText("2h 08m left")).toBeVisible()
    expect(
      screen.getByText(
        "Touch Display 2 · Front Frame and Stand · Matte Black",
      ),
    ).toBeVisible()
  })

  test("the job name carries the untouched file name and opens on a tap", async () => {
    await mountPrinterStatus([buildPrinterJob()])
    const user = userEvent.setup()
    const jobName = document.querySelector(
      ".printer-job",
    ) as HTMLButtonElement

    expect(jobName.title).toBe(
      "Touch_Display_2_-_Front_Frame_and_Stand_-_Matte_Black_-_Magi",
    )
    expect(cards()[0]?.getAttribute("data-expanded")).toBe(
      "false",
    )

    await user.click(jobName)

    expect(cards()[0]?.getAttribute("data-expanded")).toBe(
      "true",
    )
  })

  test("keeps the Filament row before the printer has chosen a tray", async () => {
    await mountPrinterStatus([
      buildPrinterJob({
        state: "preparing",
        filamentText: undefined,
        filamentColor: undefined,
      }),
    ])

    const filament = cards()[0]?.querySelector(
      ".printer-metric.is-filament",
    )

    expect(filament?.classList.contains("is-pending")).toBe(
      true,
    )
    expect(
      screen.getByText("Chosen when the print starts"),
    ).toBeVisible()
  })

  test("a paused printer offers Resume and stops quoting a finish time", async () => {
    await mountPrinterStatus([
      buildPrinterJob({ state: "paused" }),
    ])

    expect(screen.getByText("Paused")).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Resume" }),
    ).toBeVisible()
    // One em dash, not two: `Finishes`. The time left is not a metric any
    // more, and a paused card renders nothing in its place rather than a
    // placeholder holding open a space for a number that does not exist.
    expect(screen.getAllByText("—")).toHaveLength(1)
    expect(
      cards()[0]?.querySelector(".printer-band-remaining"),
    ).toBeNull()
  })

  test("the state reads in the head, the controls at the foot, and the band carries the time left and the percentage", async () => {
    await mountPrinterStatus([
      buildPrinterJob({ percent: 41, state: "printing" }),
    ])

    const card = cards()[0]
    const state = card?.querySelector(".printer-state")
    const band = card?.querySelector(".printer-band")
    const actions = card?.querySelector(".printer-actions")

    expect(state?.textContent).toBe("Printing")

    // The chip is in the head and not inside the band. This is the whole
    // point of the shape, so it is asserted structurally rather than by
    // reading the text back out of the document. The buttons are the LAST
    // thing in the card body: they moved to the foot for their size, and a
    // refactor that puts them back beside the name fails here.
    expect(
      state?.parentElement?.classList.contains(
        "printer-head",
      ),
    ).toBe(true)
    expect(band?.contains(state ?? null)).toBe(false)
    expect(actions?.nextElementSibling).toBeNull()
    expect(
      actions?.parentElement?.classList.contains(
        "printer-body",
      ),
    ).toBe(true)
    expect(
      band?.querySelector(".printer-band-text")
        ?.textContent,
    ).toBe("2h 08m left41%")

    // The time left is not also a metric. The row is Layer, Finishes and
    // Filament.
    expect(
      [
        ...(card?.querySelectorAll(".printer-metric dt") ??
          []),
      ].map((term) => term.textContent),
    ).toEqual(["Layer", "Finishes", "Filament"])
  })

  /**
   * The finish the card prints, read out of the second metric block. It is
   * found by its term rather than by index, so adding a metric cannot make
   * this assert the wrong number.
   */
  const finishText = () =>
    Array.from(
      cards()[0]?.querySelectorAll(".printer-metric") ?? [],
    )
      .find(
        (metric) =>
          metric.querySelector("dt")?.textContent ===
          "Finishes",
      )
      ?.querySelector("dd")?.textContent

  test("a finish on the same day is the bare clock time", async () => {
    await mountPrinterStatus([
      buildPrinterJob({
        finishAtMs: utcMillisOnDay({
          dayOffset: 0,
          hour: 23,
          minute: 59,
        }),
      }),
    ])

    expect(finishText()).toBe("23:59")
  })

  /**
   * The defect this view shipped with: a print that ran past midnight showed a
   * bare "15:47" beside its percentage, and it read as the same afternoon.
   */
  test("a finish on the next day names tomorrow", async () => {
    await mountPrinterStatus([
      buildPrinterJob({
        finishAtMs: utcMillisOnDay({
          dayOffset: 1,
          hour: 15,
          minute: 47,
        }),
      }),
    ])

    expect(finishText()).toBe("Tomorrow 15:47")
  })

  test("a problem is named on the card", async () => {
    await mountPrinterStatus([
      buildPrinterJob({
        problemText: "Nozzle clog detected",
      }),
    ])

    expect(
      screen.getByText("Nozzle clog detected"),
    ).toBeVisible()
    expect(cards()[0]?.getAttribute("data-intent")).toBe(
      "danger",
    )
  })

  test("says so when nothing is printing", async () => {
    await mountPrinterStatus([])

    expect(
      screen.getByText("Nothing printing"),
    ).toBeVisible()
    expect(cards()).toHaveLength(0)
  })
})

describe("pause and stop", () => {
  test("a stop asks first and names the printer", async () => {
    const { server } = await mountPrinterStatus([
      buildPrinterJob(),
    ])
    const user = userEvent.setup()

    await user.click(cardActions(".is-stop")[0]!)

    expect(
      screen.getByText("Stop this print?"),
    ).toBeVisible()
    expect(server.commands).toEqual([])
  })

  test("keeping the print sends nothing", async () => {
    const { server } = await mountPrinterStatus([
      buildPrinterJob(),
    ])
    const user = userEvent.setup()

    await user.click(cardActions(".is-stop")[0]!)
    await user.click(
      screen.getByRole("button", {
        name: "Keep printing",
      }),
    )

    expect(
      screen.queryByText("Stop this print?"),
    ).toBeNull()
    expect(server.commands).toEqual([])
  })

  test("confirming a stop names the printer it meant", async () => {
    const { server } = await mountPrinterStatus([
      buildPrinterJob(),
      buildPrinterJob({ id: "foopie", name: "Foopie" }),
    ])
    const user = userEvent.setup()

    await user.click(cardActions(".is-stop")[1]!)
    await user.click(commitButton()!)

    await waitUntil(() => server.commands.length > 0)
    expect(server.commands).toEqual([
      { action: "printer_stop", value: "foopie" },
    ])
  })

  test("a confirmed pause shows as pending until the printer answers", async () => {
    const { server } = await mountPrinterStatus([
      buildPrinterJob(),
    ])
    const user = userEvent.setup()

    await user.click(cardActions(".is-pause")[0]!)
    await user.click(commitButton()!)

    await waitUntil(() => server.commands.length > 0)
    expect(server.commands).toEqual([
      { action: "printer_pause", value: "magi" },
    ])
    expect(screen.getByText("Pausing…")).toBeVisible()

    server.push({
      type: "printers",
      data: {
        printers: [buildPrinterJob({ state: "paused" })],
      },
    })

    await waitUntil(() =>
      Boolean(
        cardActions(".is-pause")[0]?.textContent ===
          "Resume",
      ),
    )
    expect(screen.queryByText("Pausing…")).toBeNull()
  })
})

describe("a finished or failed print", () => {
  const clearButton = () =>
    document.querySelector<HTMLButtonElement>(
      ".printer-clear",
    )

  test("a finished card is tinted whole in success and reads 100%", async () => {
    await mountPrinterStatus([
      buildPrinterJob({
        state: "finished",
        percent: 100,
        currentLayer: 334,
      }),
    ])

    // The word is in the chip AND leads the band: the band is what is read
    // from across the room, the chip is what sits by the name.
    expect(
      cards()[0]?.querySelector(".printer-state")
        ?.textContent,
    ).toBe("Finished")
    expect(
      cards()[0]?.querySelector(".printer-band-ended")
        ?.textContent,
    ).toBe("Finished")
    expect(cards()[0]?.getAttribute("data-intent")).toBe(
      "success",
    )
    expect(cards()[0]?.getAttribute("data-state")).toBe(
      "finished",
    )
    expect(screen.getByText("100%")).toBeVisible()
    expect(
      (
        cards()[0]?.querySelector(
          ".printer-band-fill",
        ) as HTMLElement
      ).style.width,
    ).toBe("100%")
  })

  test("a failed card is tinted in danger and names the layer it stopped at", async () => {
    await mountPrinterStatus([
      buildPrinterJob({
        state: "failed",
        percent: 41,
        currentLayer: 173,
      }),
    ])

    expect(screen.getByText("Failed")).toBeVisible()
    expect(cards()[0]?.getAttribute("data-intent")).toBe(
      "danger",
    )
    expect(cards()[0]?.getAttribute("data-state")).toBe(
      "failed",
    )
    expect(screen.getByText("41%")).toBeVisible()
    expect(
      screen.getByText("Stopped at layer 173"),
    ).toBeVisible()
  })

  test("the band names the time the print ended when the payload carries it", async () => {
    await mountPrinterStatus([
      buildPrinterJob({
        state: "finished",
        percent: 100,
        finishAtMs: utcMillisOnDay({
          dayOffset: 0,
          hour: 0,
          minute: 1,
        }),
      }),
    ])

    expect(screen.getByText("Ended 00:01")).toBeVisible()
  })

  test("a plate nobody cleared overnight says so", async () => {
    await mountPrinterStatus([
      buildPrinterJob({
        state: "finished",
        percent: 100,
        finishAtMs: utcMillisOnDay({
          dayOffset: -1,
          hour: 15,
          minute: 47,
        }),
      }),
    ])

    expect(
      screen.getByText("Ended Yesterday 15:47"),
    ).toBeVisible()
  })

  test("offers Clear plate alone, and no Pause or Stop", async () => {
    await mountPrinterStatus([
      buildPrinterJob({ state: "finished", percent: 100 }),
    ])

    expect(
      screen.getByRole("button", { name: "Clear plate" }),
    ).toBeVisible()
    expect(
      cards()[0]?.querySelector(".printer-clear-hint"),
    ).toBeNull()
    expect(cardActions(".is-pause")).toHaveLength(0)
    expect(cardActions(".is-stop")).toHaveLength(0)
    expect(
      cards()[0]?.querySelector(".printer-metrics"),
    ).toBeNull()
  })

  test("Clear plate sends printer_clear_plate with the printer's id on one tap", async () => {
    const { server } = await mountPrinterStatus([
      buildPrinterJob(),
      buildPrinterJob({
        id: "foopie",
        name: "Foopie",
        state: "failed",
        percent: 41,
      }),
    ])
    const user = userEvent.setup()

    await user.click(clearButton()!)

    // No question in between: the command is the first thing that happens.
    expect(screen.queryByRole("dialog")).toBeNull()
    await waitUntil(() => server.commands.length > 0)
    expect(server.commands).toEqual([
      { action: "printer_clear_plate", value: "foopie" },
    ])
    expect(screen.getByText("Clearing…")).toBeVisible()
    expect(clearButton()?.disabled).toBe(true)
  })

  test("the card leaves when the next push no longer carries the job", async () => {
    const { server } = await mountPrinterStatus([
      buildPrinterJob({ state: "finished", percent: 100 }),
      buildPrinterJob({ id: "foopie", name: "Foopie" }),
    ])
    const user = userEvent.setup()

    await user.click(clearButton()!)
    await waitUntil(() => server.commands.length > 0)

    server.push({
      type: "printers",
      data: {
        printers: [
          buildPrinterJob({ id: "foopie", name: "Foopie" }),
        ],
      },
    })

    await waitUntil(() => cards().length === 1)
    expect(screen.queryByText("Clearing…")).toBeNull()
    expect(clearButton()).toBeNull()
  })
})

describe("a clear that nothing answers", () => {
  test("the pending label lapses after ten seconds so the button can be tapped again", async () => {
    // Mounted on real timers: the harness polls the socket with setTimeout.
    // Only the tap's own timer is faked, so the ten seconds can be advanced.
    await mountPrinterStatus([
      buildPrinterJob({ state: "finished", percent: 100 }),
    ])
    const clearButton = () =>
      document.querySelector<HTMLButtonElement>(
        ".printer-clear",
      )

    vi.useFakeTimers({ toFake: ["setTimeout"] })
    try {
      const user = userEvent.setup({
        advanceTimers: vi.advanceTimersByTime,
      })
      await user.click(clearButton()!)
      expect(clearButton()?.textContent).toBe("Clearing…")

      vi.advanceTimersByTime(9_000)
      await Promise.resolve()
      expect(clearButton()?.textContent).toBe("Clearing…")

      vi.advanceTimersByTime(1_100)
    } finally {
      vi.useRealTimers()
    }

    await waitUntil(
      () => clearButton()?.textContent === "Clear plate",
    )
    expect(clearButton()?.disabled).toBe(false)
  })
})
