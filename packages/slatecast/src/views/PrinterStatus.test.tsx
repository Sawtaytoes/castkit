import { screen } from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { describe, expect, test } from "vitest"
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

  test("the state reads beside the controls, and the band carries the time left and the percentage", async () => {
    await mountPrinterStatus([
      buildPrinterJob({ percent: 41, state: "printing" }),
    ])

    const card = cards()[0]
    const state = card?.querySelector(".printer-state")
    const band = card?.querySelector(".printer-band")

    expect(state?.textContent).toBe("Printing")

    // It is a sibling of the buttons, inside the head's control group and not
    // inside the band. This is the whole point of the shape, so it is asserted
    // structurally rather than by reading the text back out of the document.
    // The group exists so the chip and the buttons wrap together at three
    // columns; the chip must never be separated from them.
    const controls = state?.parentElement
    expect(
      controls?.classList.contains("printer-head-controls"),
    ).toBe(true)
    expect(
      controls?.parentElement?.classList.contains(
        "printer-head",
      ),
    ).toBe(true)
    expect(
      state?.nextElementSibling?.classList.contains(
        "printer-actions",
      ),
    ).toBe(true)
    expect(band?.contains(state ?? null)).toBe(false)
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
