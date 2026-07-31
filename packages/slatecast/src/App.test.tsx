import { screen, waitFor } from "@testing-library/preact"
import { describe, expect, test } from "vitest"
import {
  buildDeviceProfile,
  buildNowPlaying,
  buildQueue,
  buildSettings,
  buildSnapshot,
} from "./__fixtures__/buildSnapshot.ts"
import { mountSlatecast } from "./__tests__/setup/mountSlatecast.tsx"
import { waitUntil } from "./__tests__/setup/slatecastServer.ts"
import { connectionStatus } from "./state.ts"

const stage = () => document.querySelector(".stage")

describe("view switching", () => {
  test("swaps views on a view message without reloading", async () => {
    const { server } = await mountSlatecast({
      snapshot: buildSnapshot({
        view: "now-playing",
        data: {
          nowPlaying: buildNowPlaying(),
          queue: buildQueue(),
        },
      }),
    })
    expect(screen.getByText("Roygbiv")).toBeVisible()

    server.push({ type: "view", view: "queue" })

    await waitFor(() => {
      expect(screen.getByText("Olson")).toBeVisible()
    })
  })

  test("falls back to now playing for an unknown view id", async () => {
    const { server } = await mountSlatecast()

    server.push({
      type: "view",
      view: "not-a-real-view",
    })

    await waitFor(() => {
      expect(
        screen.getByText("Boards of Canada"),
      ).toBeVisible()
    })
  })
})

describe("device settings", () => {
  test("rotates the stage and swaps the axis when sideways", async () => {
    await mountSlatecast({
      snapshot: buildSnapshot({
        settings: buildSettings({ orientation: 90 }),
      }),
    })

    const element = stage() as HTMLElement
    expect(element.style.transform).toBe("rotate(90deg)")
    expect(element.style.width).toBe("100vh")
    expect(element.style.height).toBe("100vw")
  })

  test("leaves an unrotated stage untransformed", async () => {
    await mountSlatecast({
      snapshot: buildSnapshot({
        settings: buildSettings({ orientation: 0 }),
      }),
    })

    const element = stage() as HTMLElement
    expect(element.style.transform).toBe("")
    expect(element.style.width).toBe("100vw")
  })

  test("applies the theme and shape, and marks a touchless device", async () => {
    await mountSlatecast({
      snapshot: buildSnapshot({
        device: buildDeviceProfile({
          shape: "round",
          hasTouch: false,
        }),
        settings: buildSettings({ theme: "Light" }),
      }),
    })

    const element = stage() as HTMLElement
    expect(element.dataset.theme).toBe("light")
    expect(element.className).toContain("shape-round")
    expect(element.className).toContain("touchless")
  })

  test("a live settings message re-themes without a reload", async () => {
    const { server } = await mountSlatecast({
      snapshot: buildSnapshot({
        settings: buildSettings({ theme: "Dark" }),
      }),
    })
    expect((stage() as HTMLElement).dataset.theme).toBe(
      "dark",
    )

    server.push({
      type: "settings",
      settings: buildSettings({ theme: "Light" }),
    })

    await waitFor(() => {
      expect((stage() as HTMLElement).dataset.theme).toBe(
        "light",
      )
    })
  })
})

describe("connection lifecycle", () => {
  test("reports connected once the socket opens", async () => {
    await mountSlatecast()

    await waitUntil(() => connectionStatus.is("connected"))
    expect(connectionStatus.getState().status).toBe(
      "connected",
    )
  })

  test("a reconnect snapshot is authoritative over a stale prediction", async () => {
    const { server } = await mountSlatecast()

    // Predict a pause, then have the server re-snapshot as still playing —
    // a fresh snapshot means the client just (re)connected, so whatever it
    // says wins over anything predicted before the drop.
    const pause = screen.getByRole("button", {
      name: "Pause",
    })
    pause.click()
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Play" }),
      ).toBeVisible()
    })

    server.push(
      buildSnapshot({
        data: {
          nowPlaying: buildNowPlaying({ isPlaying: true }),
        },
      }),
    )

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Pause" }),
      ).toBeVisible()
    })
  })
})

describe("unknown device", () => {
  test("renders the unknown-device notice when the shell has no snapshot", async () => {
    await mountSlatecast({ snapshot: null })

    expect(screen.getByText("Unknown device")).toBeVisible()
  })
})
