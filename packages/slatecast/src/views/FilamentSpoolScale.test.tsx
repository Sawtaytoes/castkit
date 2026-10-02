import type { SpoolsData } from "@castkit/shared/viewData/types"
import { screen } from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { describe, expect, test } from "vitest"
import {
  buildDeviceProfile,
  buildSnapshot,
} from "../__fixtures__/buildSnapshot.ts"
import {
  ASH_GRAY_SPOOL,
  buildMatchedSpools,
  buildSpools,
  buildUnknownSpools,
  INVENTORY,
  PRINTERS,
} from "../__fixtures__/buildSpools.ts"
import { mountSlatecast } from "../__tests__/setup/mountSlatecast.tsx"
import { waitUntil } from "../__tests__/setup/slatecastServer.ts"
import { resetSpoolScreen } from "./spoolScreen.ts"

const mountSpoolScale = async (
  spools: SpoolsData | undefined,
) => {
  // The screen is module state, so a test that left the AMS side up would
  // hand it to the next one.
  resetSpoolScreen()
  return mountSlatecast({
    snapshot: buildSnapshot({
      device: buildDeviceProfile({
        width: 1_280,
        height: 720,
        shape: "rectangle",
        views: [
          {
            name: "Filament Spool Scale",
            clientId: "filament-spool-scale",
          },
          { name: "Clock", clientId: "clock" },
        ],
      }),
      view: "filament-spool-scale",
      data: spools ? { spools } : {},
    }),
  })
}

const currentScreen = () =>
  document
    .querySelector(".fss")
    ?.getAttribute("data-screen")

const button = (name: string | RegExp) =>
  screen.getByRole("button", { name })

describe("the reader's screen", () => {
  test("says it is waiting before the first spools push", async () => {
    await mountSpoolScale(undefined)

    expect(
      screen.getByText("Waiting for the scale"),
    ).toBeVisible()
    expect(currentScreen()).toBe("waiting")
  })

  test("nothing on the reader is Ready to scan, with the scale in the corner", async () => {
    await mountSpoolScale(buildSpools())

    expect(screen.getByText("Ready to scan")).toBeVisible()
    expect(screen.getByText("Scale 0 g")).toBeVisible()
    expect(button("AMS")).toBeVisible()
    expect(currentScreen()).toBe("ready")
  })

  test("a matched tag shows the spool, where it is, and the two counts", async () => {
    await mountSpoolScale(buildMatchedSpools())

    expect(screen.getByText("PLA Matte")).toBeVisible()
    expect(screen.getByText("Ash Gray")).toBeVisible()
    expect(
      screen.getByText("Bambu Lab · 1 kg"),
    ).toBeVisible()
    expect(
      screen.getByText("Quadrahedron · AMS 1 · slot 2"),
    ).toBeVisible()
    expect(
      screen.getByText("Bambu tag matched"),
    ).toBeVisible()
    // The scale's 542 g minus the 250 g core, against the 1 kg label.
    expect(screen.getByText("Remaining")).toBeVisible()
    expect(screen.getByText("g · 29%")).toBeVisible()
    // The record's own count is a separate fact.
    expect(screen.getByText("g · 16%")).toBeVisible()
    expect(currentScreen()).toBe("matched")
  })

  test("an unknown tag names itself and offers copy and link", async () => {
    await mountSpoolScale(buildUnknownSpools())

    expect(
      screen.getByText("Unknown tag · NTAG215"),
    ).toBeVisible()
    expect(screen.getByText("04B5C84D")).toBeVisible()
    expect(button("Copy an existing spool")).toBeVisible()
    expect(
      button("Link to a spool without a tag"),
    ).toBeVisible()
    // The note is prose, not a control.
    expect(screen.getByText("New product?")).toBeVisible()
    expect(
      screen.queryByRole("button", { name: /New product/ }),
    ).toBeNull()
    expect(currentScreen()).toBe("unknown")
  })

  test("an offline scale says so instead of a number", async () => {
    await mountSpoolScale(
      buildMatchedSpools({
        scale: {
          grams: 0,
          isStable: false,
          isOnline: false,
        },
      }),
    )

    expect(
      screen.getAllByText("Scale offline").length,
    ).toBe(2)
    expect(button("Scale offline")).toBeDisabled()
  })
})

describe("the ready screen's ring", () => {
  const ringLoad = () =>
    document
      .querySelector(".fss-stage")
      ?.getAttribute("data-load")

  test("nothing on the scale keeps Ready to scan and a listening ring", async () => {
    await mountSpoolScale(buildSpools())

    expect(screen.getByText("Ready to scan")).toBeVisible()
    expect(ringLoad()).toBe("empty")
  })

  test("a weight with no tag shows its grams and turns the ring", async () => {
    await mountSpoolScale(
      buildSpools({
        scale: {
          grams: 500,
          isStable: true,
          isOnline: true,
        },
      }),
    )

    expect(screen.getByText("500 g")).toBeVisible()
    expect(
      screen.getByText("On the scale. No tag was read."),
    ).toBeVisible()
    expect(currentScreen()).toBe("weighing")
    expect(ringLoad()).toBe("stable")
  })

  test("a reading that has not settled says it is weighing", async () => {
    await mountSpoolScale(
      buildSpools({
        scale: {
          grams: 1_210,
          isStable: false,
          isOnline: true,
        },
      }),
    )

    expect(screen.getByText("1 210 g")).toBeVisible()
    expect(screen.getByText("Weighing…")).toBeVisible()
    expect(ringLoad()).toBe("settling")
  })

  test("a few grams of creep is still nothing on the scale", async () => {
    await mountSpoolScale(
      buildSpools({
        scale: {
          grams: 4,
          isStable: false,
          isOnline: true,
        },
      }),
    )

    expect(screen.getByText("Ready to scan")).toBeVisible()
    expect(ringLoad()).toBe("empty")
  })

  test("an offline scale stills the ring", async () => {
    await mountSpoolScale(
      buildSpools({
        scale: {
          grams: 0,
          isStable: false,
          isOnline: false,
        },
      }),
    )

    expect(screen.getByText("Ready to scan")).toBeVisible()
    expect(ringLoad()).toBe("offline")
  })
})

describe("saving the weight", () => {
  test("the button names the net grams and sends the scale's reading", async () => {
    const { server } = await mountSpoolScale(
      buildMatchedSpools(),
    )
    const user = userEvent.setup()

    // 542 g on the scale, 250 g of core.
    await user.click(button("Save 292 g remaining"))

    await waitUntil(() => server.commands.length > 0)
    expect(server.commands).toEqual([
      {
        action: "spool_save_weight",
        value: ASH_GRAY_SPOOL.id,
        payload: { grams: 542 },
      },
    ])
    expect(screen.getByText("Saving…")).toBeVisible()
  })

  test("the label follows the scale, and never goes below zero", async () => {
    const { server } = await mountSpoolScale(
      buildMatchedSpools(),
    )

    server.push({
      type: "spools",
      data: buildMatchedSpools({
        scale: {
          grams: 120,
          isStable: true,
          isOnline: true,
        },
      }),
    })

    await waitUntil(() =>
      Boolean(
        screen.queryByRole("button", {
          name: "Save 0 g remaining",
        }),
      ),
    )
    expect(screen.getByText("Scale 120 g")).toBeVisible()
  })

  test("the record catching up turns the button into Saved", async () => {
    const { server } = await mountSpoolScale(
      buildMatchedSpools(),
    )
    const user = userEvent.setup()

    await user.click(button("Save 292 g remaining"))
    await waitUntil(() => server.commands.length > 0)

    server.push({
      type: "spools",
      data: buildMatchedSpools({
        spools: INVENTORY.map((spool) =>
          spool.id === ASH_GRAY_SPOOL.id
            ? {
                ...spool,
                lastScaleGrams: 542,
                remainingGrams: 292,
              }
            : spool,
        ),
      }),
    })

    await waitUntil(() =>
      Boolean(
        screen.queryByRole("button", {
          name: "Saved 292 g remaining",
        }),
      ),
    )
  })
})

describe("assigning to a slot", () => {
  test("three taps reach a slot and send the printer, AMS and tray ids", async () => {
    const { server } = await mountSpoolScale(
      buildMatchedSpools(),
    )
    const user = userEvent.setup()

    await user.click(button("Assign to an AMS slot"))
    expect(currentScreen()).toBe("assign")
    expect(screen.getByText("Tap a printer.")).toBeVisible()
    // Magi has an unread spool and Foopie has empty slots; Quadrahedron is full.
    expect(screen.getAllByText("Has room")).toHaveLength(2)

    await user.click(button(/2 · Foopie/))
    expect(screen.getByText("Tap an AMS.")).toBeVisible()
    expect(
      screen.getByText("19% RH · 2 spools with no tag"),
    ).toBeVisible()

    await user.click(button(/^AMS 2/))
    expect(
      screen.getByText(
        "Tap a slot to assign Ash Gray to it.",
      ),
    ).toBeVisible()
    expect(
      screen.getByText("Likely this one"),
    ).toBeVisible()
    expect(
      screen.getByText("Different material"),
    ).toBeVisible()

    await user.click(button(/^Slot 2/))

    await waitUntil(() => server.commands.length > 0)
    expect(server.commands).toEqual([
      {
        action: "spool_assign_slot",
        value: ASH_GRAY_SPOOL.id,
        payload: {
          printerId: "foopie",
          amsId: 1,
          trayId: 1,
        },
      },
    ])
    expect(currentScreen()).toBe("matched")
  })

  test("completed stages return directly and discard dependent choices without assigning", async () => {
    const { server } = await mountSpoolScale(
      buildMatchedSpools(),
    )
    const user = userEvent.setup()
    await user.click(button("Assign to an AMS slot"))
    await user.click(button(/2 · Foopie/))
    await user.click(button(/^AMS 2/))
    await user.click(button("Return to Printer"))
    expect(screen.getByText("Tap a printer.")).toBeVisible()
    await user.click(button(/1 · Magi/))
    expect(screen.getByText("Tap an AMS.")).toBeVisible()
    expect(server.commands).toEqual([])
    await user.click(button(/^AMS 1/))
    await user.click(button("Return to AMS"))
    expect(screen.getByText("Tap an AMS.")).toBeVisible()
    expect(server.commands).toEqual([])
  })

  test("Back undoes one tap and Cancel leaves the flow", async () => {
    const { server } = await mountSpoolScale(
      buildMatchedSpools(),
    )
    const user = userEvent.setup()

    await user.click(button("Assign to an AMS slot"))
    await user.click(button(/2 · Foopie/))
    await user.click(button("Back"))
    expect(screen.getByText("Tap a printer.")).toBeVisible()

    await user.click(button("Cancel"))
    expect(currentScreen()).toBe("matched")
    expect(server.commands).toEqual([])
  })

  test("a printer that is offline cannot be chosen", async () => {
    await mountSpoolScale(
      buildMatchedSpools({
        printers: PRINTERS.map((printer) =>
          printer.id === "magi"
            ? { ...printer, isOnline: false }
            : printer,
        ),
      }),
    )
    const user = userEvent.setup()

    await user.click(button("Assign to an AMS slot"))

    expect(button(/1 · Magi/)).toBeDisabled()
    expect(screen.getByText("Offline")).toBeVisible()
  })
})

describe("copying and linking a tag", () => {
  test("the copy picker sends the tapped spool with the tag's facts", async () => {
    const { server } = await mountSpoolScale(
      buildUnknownSpools(),
    )
    const user = userEvent.setup()

    await user.click(button("Copy an existing spool"))
    expect(
      screen.getByText("Copy which spool?"),
    ).toBeVisible()
    expect(
      screen.getByText("for tag 04B5C84D"),
    ).toBeVisible()

    await user.click(button(/Apple Green/))

    await waitUntil(() => server.commands.length > 0)
    expect(server.commands).toEqual([
      {
        action: "spool_copy_to_tag",
        value: "spool-apple-green",
        payload: { tagUid: "04B5C84D", tagType: "NTAG215" },
      },
    ])
    expect(currentScreen()).toBe("unknown")
  })

  test("the link picker lists only spools with no tag and sends spool_link_tag", async () => {
    const { server } = await mountSpoolScale(
      buildUnknownSpools(),
    )
    const user = userEvent.setup()

    await user.click(
      button("Link to a spool without a tag"),
    )
    expect(
      screen.getByText("Link which spool?"),
    ).toBeVisible()

    const tiles = document.querySelectorAll(".fss-tile")
    expect(tiles).toHaveLength(
      INVENTORY.filter(
        (spool) => spool.tagUid === undefined,
      ).length,
    )
    expect(
      screen.queryByRole("button", { name: /Apple Green/ }),
    ).toBeNull()

    await user.click(button(/Translucent Gray/))

    await waitUntil(() => server.commands.length > 0)
    expect(server.commands).toEqual([
      {
        action: "spool_link_tag",
        value: "spool-translucent-gray",
        payload: { tagUid: "04B5C84D", tagType: "NTAG215" },
      },
    ])
  })

  test("a brand chip narrows the grid", async () => {
    await mountSpoolScale(buildUnknownSpools())
    const user = userEvent.setup()

    await user.click(button("Copy an existing spool"))
    await user.click(button("Polymaker"))

    expect(
      document.querySelectorAll(".fss-tile"),
    ).toHaveLength(
      INVENTORY.filter(
        (spool) => spool.brand === "Polymaker",
      ).length,
    )
  })

  test("the picker closes by itself when the tag leaves the reader", async () => {
    const { server } = await mountSpoolScale(
      buildUnknownSpools(),
    )
    const user = userEvent.setup()

    await user.click(button("Copy an existing spool"))
    expect(currentScreen()).toBe("pick")

    server.push({ type: "spools", data: buildSpools() })

    await waitUntil(() => currentScreen() === "ready")
  })
})

describe("the AMS view", () => {
  test("names the three slot states and the printer's warnings", async () => {
    await mountSpoolScale(buildSpools())
    const user = userEvent.setup()

    await user.click(button("AMS"))
    expect(currentScreen()).toBe("ams")

    await user.click(button(/2 · Foopie/))

    expect(screen.getAllByText("Empty")).toHaveLength(2)
    expect(
      screen.getAllByText("Spool, no tag"),
    ).toHaveLength(2)
    expect(screen.getByText("1 slot low")).toBeVisible()
    expect(
      screen.getByText("2 spools with no tag"),
    ).toBeVisible()
    expect(screen.getByText("4%")).toBeVisible()
    // Nothing on the reader: a slot is a fact, not a control.
    expect(
      document.querySelectorAll("button.fss-slot"),
    ).toHaveLength(0)

    await user.click(button("Spool"))
    expect(currentScreen()).toBe("ready")
  })

  test("with a matched spool on the reader, tapping a slot assigns it there", async () => {
    const { server } = await mountSpoolScale(
      buildMatchedSpools(),
    )
    const user = userEvent.setup()

    await user.click(button("AMS"))
    await user.click(button(/2 · Foopie/))
    expect(
      screen.getAllByText("PLA · tap to assign"),
    ).toHaveLength(1)

    await user.click(
      button(/Spool, no tag.*PETG · tap to assign/),
    )

    await waitUntil(() => server.commands.length > 0)
    expect(server.commands).toEqual([
      {
        action: "spool_assign_slot",
        value: ASH_GRAY_SPOOL.id,
        payload: {
          printerId: "foopie",
          amsId: 1,
          trayId: 3,
        },
      },
    ])
    expect(currentScreen()).toBe("matched")
  })

  test("an offline printer's units draw dimmed and its slots stay read-only", async () => {
    await mountSpoolScale(
      buildMatchedSpools({
        printers: PRINTERS.map((printer) =>
          printer.id === "foopie"
            ? { ...printer, isOnline: false }
            : printer,
        ),
      }),
    )
    const user = userEvent.setup()

    await user.click(button("AMS"))
    await user.click(button(/2 · Foopie/))

    expect(
      document
        .querySelector(".fss-ams-grid")
        ?.classList.contains("is-offline"),
    ).toBe(true)
    expect(
      document.querySelectorAll("button.fss-slot"),
    ).toHaveLength(0)
  })
})
