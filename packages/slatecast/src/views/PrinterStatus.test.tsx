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
    expect(screen.getByText("2h 08m")).toBeVisible()
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

  test("a paused printer offers Resume and stops quoting a finish time", async () => {
    await mountPrinterStatus([
      buildPrinterJob({ state: "paused" }),
    ])

    expect(screen.getByText("Paused")).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Resume" }),
    ).toBeVisible()
    expect(screen.getAllByText("—")).toHaveLength(2)
  })

  test("the state reads beside the controls, and the band carries only the percentage", async () => {
    await mountPrinterStatus([
      buildPrinterJob({ percent: 41, state: "printing" }),
    ])

    const card = cards()[0]
    const state = card?.querySelector(".printer-state")
    const band = card?.querySelector(".printer-band")

    expect(state?.textContent).toBe("Printing")

    // It is a sibling of the buttons, in the head — not inside the band. This is
    // the whole point of the shape, so it is asserted structurally rather than
    // by reading the text back out of the document.
    expect(
      state?.parentElement?.classList.contains(
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
    ).toBe("41%")
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
