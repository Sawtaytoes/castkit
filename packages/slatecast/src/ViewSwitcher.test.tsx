import { fireEvent, screen } from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { describe, expect, test } from "vitest"
import {
  buildDeviceProfile,
  buildSnapshot,
} from "./__fixtures__/buildSnapshot.ts"
import { mountSlatecast } from "./__tests__/setup/mountSlatecast.tsx"
import { waitUntil } from "./__tests__/setup/slatecastServer.ts"
import { EDGE_PULL_COMMIT_PIXELS } from "./ViewSwitcher.tsx"

const deviceWithSpoolBuddy = () =>
  buildDeviceProfile({
    hasViewDrawer: true,
    externalViews: [
      {
        name: "SpoolBuddy",
        url: "https://example.com/spoolbuddy",
      },
    ],
    views: [
      { name: "Clock", clientId: "clock" },
      { name: "Touch Test", clientId: "touch-test" },
      { name: "SpoolBuddy", clientId: "external-view:0" },
    ],
  })

describe("the on-screen view switcher", () => {
  test("remains available above an external view and requests a chosen view", async () => {
    const { server } = await mountSlatecast({
      snapshot: buildSnapshot({
        device: deviceWithSpoolBuddy(),
        view: "external-view:0",
      }),
    })
    const user = userEvent.setup()

    expect(screen.getByTitle("SpoolBuddy")).toBeVisible()
    await user.click(
      screen.getByRole("button", {
        name: "Open views from right edge",
      }),
    )
    await user.click(
      screen.getByRole("button", { name: "Clock" }),
    )

    await waitUntil(() => server.commands.length > 0)
    expect(server.commands).toEqual([
      { action: "view", value: "clock" },
    ])
  })

  test("an inward pull from the left edge opens every offered view", async () => {
    await mountSlatecast({
      snapshot: buildSnapshot({
        device: deviceWithSpoolBuddy(),
      }),
    })
    const handle = screen.getByRole("button", {
      name: "Open views from left edge",
    })

    fireEvent.pointerDown(handle, {
      pointerId: 4,
      clientX: 0,
    })
    fireEvent.pointerMove(handle, {
      pointerId: 4,
      clientX: EDGE_PULL_COMMIT_PIXELS + 1,
    })

    expect(
      screen.getByRole("dialog", { name: "Views" }),
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "SpoolBuddy" }),
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Touch Test" }),
    ).toBeVisible()
  })

  test("a touchless panel has no edge controls", async () => {
    await mountSlatecast({
      snapshot: buildSnapshot({
        device: buildDeviceProfile({ hasTouch: false }),
      }),
    })

    expect(
      screen.queryByRole("button", {
        name: "Open views from left edge",
      }),
    ).toBeNull()
  })

  test("a touch panel without an enabled drawer has no edge controls", async () => {
    await mountSlatecast({
      snapshot: buildSnapshot({
        device: buildDeviceProfile({
          hasViewDrawer: false,
        }),
      }),
    })

    expect(
      screen.queryByRole("button", {
        name: "Open views from left edge",
      }),
    ).toBeNull()
  })
})
