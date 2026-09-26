import { screen, waitFor } from "@testing-library/preact"
import { describe, expect, test } from "vitest"
import {
  buildDeviceProfile,
  buildNowPlaying,
  buildQueue,
  buildSettings,
  buildSnapshot,
} from "./__fixtures__/buildSnapshot.ts"
import { dragArtwork } from "./__tests__/setup/dragArtwork.ts"
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

  test("shows a configured external application as a CastKit view", async () => {
    await mountSlatecast({
      snapshot: buildSnapshot({
        view: "external-view:0",
        device: buildDeviceProfile({
          externalViews: [
            {
              name: "Disc App",
              url: "https://example.com/kiosk",
            },
          ],
        }),
      }),
    })

    expect(screen.getByTitle("Disc App")).toHaveAttribute(
      "src",
      "https://example.com/kiosk",
    )
    expect(screen.getByTitle("Disc App")).toHaveAttribute(
      "data-castkit-target",
      "external-view:Disc App",
    )
    expect(stage()).toHaveAttribute(
      "data-castkit-ready",
      "true",
    )
  })

  test("zooms a configured external application", async () => {
    await mountSlatecast({
      snapshot: buildSnapshot({
        view: "external-view:0",
        device: buildDeviceProfile({
          externalViews: [
            {
              name: "Disc App",
              url: "https://example.com/kiosk",
              zoom: 1.5,
            },
          ],
        }),
      }),
    })

    expect(
      getComputedStyle(screen.getByTitle("Disc App")).zoom,
    ).toBe("1.5")
  })
})

describe("an external view with a health probe", () => {
  const spoolApp = {
    name: "Spool App",
    url: "https://example.com/spools",
  }

  const mountExternalView = (isAvailable?: boolean) =>
    mountSlatecast({
      snapshot: buildSnapshot({
        view: "external-view:0",
        device: buildDeviceProfile({
          externalViews: [
            isAvailable === undefined
              ? spoolApp
              : { ...spoolApp, isAvailable },
          ],
        }),
      }),
    })

  test("shows a placeholder instead of the frame while the application is not available", async () => {
    await mountExternalView(false)

    expect(
      screen.getByText("Spool App is not available"),
    ).toBeVisible()
    expect(
      screen.getByText(
        "This view opens by itself when Spool App answers.",
      ),
    ).toBeVisible()
    expect(screen.queryByTitle("Spool App")).toBeNull()
  })

  test("frames the application while it is available", async () => {
    await mountExternalView(true)

    expect(screen.getByTitle("Spool App")).toHaveAttribute(
      "src",
      "https://example.com/spools",
    )
  })

  test("frames the application when no probe answer is present", async () => {
    await mountExternalView()

    expect(screen.getByTitle("Spool App")).toHaveAttribute(
      "src",
      "https://example.com/spools",
    )
  })

  test("swaps the placeholder and a fresh frame as the availability changes", async () => {
    const { server } = await mountExternalView(false)

    server.push({
      type: "external_views",
      externalViews: [{ ...spoolApp, isAvailable: true }],
    })
    await waitFor(() => {
      expect(screen.getByTitle("Spool App")).toBeVisible()
    })
    const firstFrame = screen.getByTitle("Spool App")

    server.push({
      type: "external_views",
      externalViews: [{ ...spoolApp, isAvailable: false }],
    })
    await waitFor(() => {
      expect(
        screen.getByText("Spool App is not available"),
      ).toBeVisible()
    })
    expect(screen.queryByTitle("Spool App")).toBeNull()

    server.push({
      type: "external_views",
      externalViews: [{ ...spoolApp, isAvailable: true }],
    })
    await waitFor(() => {
      expect(screen.getByTitle("Spool App")).toBeVisible()
    })
    expect(screen.getByTitle("Spool App")).not.toBe(
      firstFrame,
    )
  })

  test("keeps the zoom on a frame that returns", async () => {
    const { server } = await mountSlatecast({
      snapshot: buildSnapshot({
        view: "external-view:0",
        device: buildDeviceProfile({
          externalViews: [
            { ...spoolApp, zoom: 1.5, isAvailable: false },
          ],
        }),
      }),
    })

    server.push({
      type: "external_views",
      externalViews: [
        { ...spoolApp, zoom: 1.5, isAvailable: true },
      ],
    })

    await waitFor(() => {
      expect(
        getComputedStyle(screen.getByTitle("Spool App"))
          .zoom,
      ).toBe("1.5")
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

  /*
   * The page shell already wrote these. The client writes them again because
   * the profile arrives on every reconnect and a kiosk panel holds its page
   * for weeks — without it, editing a display's `pixelGrid` would need
   * somebody to walk to the glass and reload it.
   */
  test("stamps the panel facts on the root element", async () => {
    await mountSlatecast({
      snapshot: buildSnapshot({
        device: buildDeviceProfile({
          hasPanelDithering: true,
          pixelGrid: "none",
          repaint: "slow",
        }),
      }),
    })

    const { dataset } = document.documentElement
    expect(dataset.repaint).toBe("slow")
    expect(dataset.panelDithering).toBe("true")
    expect(dataset.pixelGrid).toBe("none")
    expect(dataset.grayscaleText).toBe("true")
    expect(dataset.delivery).toBe("live-browser")
    expect(dataset.input).toBe("touch")
  })

  test("carries the layout box as custom properties", async () => {
    await mountSlatecast({
      snapshot: buildSnapshot({
        device: buildDeviceProfile({
          width: 1280,
          height: 720,
        }),
      }),
    })

    const { style } = document.documentElement
    expect(style.getPropertyValue("--panel-width")).toBe(
      "1280px",
    )
    expect(style.getPropertyValue("--panel-height")).toBe(
      "720px",
    )
    expect(style.getPropertyValue("--panel-min")).toBe(
      "720px",
    )
  })

  /*
   * `orientation` is a live setting an HA automation can flip under a
   * motorized mount, and it is half of whether subpixel text is safe. A stamp
   * that only ran on the first snapshot would leave a turned panel fringing.
   */
  test("a live rotation re-derives whether text may use subpixels", async () => {
    const { server } = await mountSlatecast({
      snapshot: buildSnapshot({
        device: buildDeviceProfile({
          pixelGrid: "rgb-stripe",
        }),
        settings: buildSettings({ orientation: 0 }),
      }),
    })
    expect(
      document.documentElement.dataset.grayscaleText,
    ).toBe("false")

    server.push({
      type: "settings",
      settings: buildSettings({ orientation: 90 }),
    })

    await waitFor(() => {
      expect(
        document.documentElement.dataset.grayscaleText,
      ).toBe("true")
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
    // The artwork is the play/pause button, and it listens to pointer events
    // rather than clicks — a tap is a press with no travel.
    expect(
      screen.getByRole("button", { name: /^Pause/ }),
    ).toBeVisible()
    await dragArtwork({ offsets: [] })
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /^Play/ }),
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
        screen.getByRole("button", { name: /^Pause/ }),
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

/**
 * A panel holds one page for weeks while the server is deployed under it, so
 * "the bundle does not have that view" is a real state and not a theoretical
 * one. On 2026-09-23 it put "Nothing playing" on a workbench panel over two
 * running prints, because the fallback was Now Playing.
 */
describe("a view this bundle does not have", () => {
  test("says the display is out of date rather than falling back to Now Playing", async () => {
    const { server } = await mountSlatecast()

    // A clientId from a build this bundle predates — which is exactly what
    // `printer-status` was to the panel on the day this was found.
    server.push({
      type: "view",
      view: "a-view-from-a-later-build",
    })

    await waitFor(() => {
      expect(
        screen.getByText("This display is out of date"),
      ).toBeVisible()
    })
    expect(
      screen.queryByRole("button", { name: /^Pause/ }),
    ).toBeNull()
  })
})
