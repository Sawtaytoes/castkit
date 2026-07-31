import { screen, waitFor } from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { describe, expect, test } from "vitest"
import {
  buildNowPlaying,
  buildSnapshot,
} from "./__fixtures__/buildSnapshot.ts"
import { mountSlatecast } from "./__tests__/setup/mountSlatecast.tsx"
import { waitUntil } from "./__tests__/setup/slatecastServer.ts"
import { connectionStatus, nowPlaying } from "./state.ts"

const pauseButton = () =>
  screen.getByRole("button", { name: "Pause" })
const playButton = () =>
  screen.getByRole("button", { name: "Play" })

describe("optimistic play/pause", () => {
  test("flips the button before the server confirms", async () => {
    const { server } = await mountSlatecast()
    const user = userEvent.setup()

    await user.click(pauseButton())

    // No now_playing frame has been pushed — this is purely the prediction.
    expect(playButton()).toBeVisible()
    await waitUntil(() => server.commands.length > 0)
    expect(server.commands).toEqual([
      { action: "play_pause" },
    ])
  })

  test("keeps the prediction when a stale frame races the command", async () => {
    const { server } = await mountSlatecast()
    const user = userEvent.setup()

    await user.click(pauseButton())
    // HA republishing the pre-command state must not flicker the button back.
    server.push({
      type: "now_playing",
      data: buildNowPlaying({ isPlaying: true }),
    })

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(playButton()).toBeVisible()
  })

  test("yields to the server once it confirms", async () => {
    const { server } = await mountSlatecast()
    const user = userEvent.setup()

    await user.click(pauseButton())
    server.push({
      type: "now_playing",
      data: buildNowPlaying({ isPlaying: false }),
    })
    await waitFor(() => {
      expect(playButton()).toBeVisible()
    })

    // Prediction cleared, so the server is authoritative again: a frame
    // saying "playing" must now be believed rather than overridden.
    server.push({
      type: "now_playing",
      data: buildNowPlaying({ isPlaying: true }),
    })
    await waitFor(() => {
      expect(pauseButton()).toBeVisible()
    })
  })

  test("freezes the seek bar instead of snapping it backwards", async () => {
    const { server, view } = await mountSlatecast({
      snapshot: buildSnapshot({
        data: {
          nowPlaying: buildNowPlaying({
            positionSeconds: 30,
            // Stamped 5 s ago, so the live position reads ~0:35 — the exact
            // value depends on where the 1 Hz tick lands, hence the range.
            positionUpdatedAtMs: Date.now() - 5_000,
          }),
        },
      }),
    })
    const user = userEvent.setup()
    const positionSeconds = () => {
      const [minutes, seconds] = (
        view.container.querySelector(".seek-time")
          ?.textContent ?? ""
      )
        .split(":")
        .map(Number)
      return minutes * 60 + seconds
    }
    const beforeSeconds = positionSeconds()
    expect(beforeSeconds).toBeGreaterThanOrEqual(34)

    await user.click(pauseButton())
    await new Promise((resolve) => setTimeout(resolve, 50))

    // Flipping isPlaying without re-stamping the position would drop the
    // accumulated 5 s and snap the bar back to 0:30.
    expect(positionSeconds()).toBeGreaterThanOrEqual(
      beforeSeconds,
    )
    expect(positionSeconds()).toBeLessThanOrEqual(
      beforeSeconds + 1,
    )
    expect(server.commands).toEqual([
      { action: "play_pause" },
    ])
  })
})

describe("optimistic volume", () => {
  test("throttles while dragging but always publishes the final value", async () => {
    const { server } = await mountSlatecast()
    const slider = screen.getByRole("slider", {
      name: "Volume",
    })

    // Six rapid inputs inside one 150 ms throttle window.
    const values = [55, 60, 65, 70, 75, 80]
    values.forEach((value) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(slider, String(value))
      slider.dispatchEvent(
        new Event("input", { bubbles: true }),
      )
    })

    await waitUntil(() => {
      const last = server.commands.at(-1)
      return last?.value === 0.8
    })
    expect(server.commands.length).toBeLessThan(
      values.length,
    )
    expect(server.commands.at(-1)).toEqual({
      action: "volume_set",
      value: 0.8,
    })
    expect(
      server.commands.every(
        (command) => command.action === "volume_set",
      ),
    ).toBe(true)
  })

  test("moves the slider immediately, before any server frame", async () => {
    await mountSlatecast()
    const slider = screen.getByRole("slider", {
      name: "Volume",
    }) as HTMLInputElement
    expect(slider.value).toBe("50")

    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(slider, "90")
    slider.dispatchEvent(
      new Event("input", { bubbles: true }),
    )

    await waitFor(() => {
      expect(
        (
          screen.getByRole("slider", {
            name: "Volume",
          }) as HTMLInputElement
        ).value,
      ).toBe("90")
    })
  })
})

describe("optimistic mute and skips", () => {
  test("mute flips its icon before the server confirms", async () => {
    const { server } = await mountSlatecast()
    const user = userEvent.setup()

    await user.click(
      screen.getByRole("button", { name: "Mute" }),
    )

    await waitUntil(() => server.commands.length > 0)
    expect(server.commands).toEqual([
      { action: "volume_mute" },
    ])
  })

  test("a skip drops the previous track's prediction", async () => {
    const { server } = await mountSlatecast()
    const user = userEvent.setup()

    await user.click(pauseButton())
    expect(playButton()).toBeVisible()

    await user.click(
      screen.getByRole("button", { name: "Next track" }),
    )

    // The pause prediction belonged to the old track; the incoming frame for
    // the new track must be believed immediately.
    server.push({
      type: "now_playing",
      data: buildNowPlaying({
        title: "Olson",
        isPlaying: true,
      }),
    })
    await waitFor(() => {
      expect(screen.getByText("Olson")).toBeVisible()
    })
    expect(nowPlaying.value?.isPlaying).toBe(true)
    expect(server.commands).toEqual([
      { action: "play_pause" },
      { action: "next" },
    ])
  })
})

/**
 * A kiosk has no keyboard and its Home Assistant Reload button travels down
 * this very socket, so a reconnect loop that gives up strands the display until
 * somebody power-cycles it. These lock the loop's two escape hatches shut.
 */
describe("reconnect resilience", () => {
  test("keeps retrying after the WebSocket constructor throws", async () => {
    const { server } = await mountSlatecast()
    const RealWebSocket = window.WebSocket
    let hasThrown = false

    // Constructing a socket can throw synchronously (offline, blocked by
    // policy). That escapes the retry timer's callback, and an unhandled
    // throw there used to kill the loop permanently — no further attempts.
    window.WebSocket = class {
      constructor() {
        hasThrown = true
        window.WebSocket = RealWebSocket
        throw new Error("construction blocked")
      }
    } as unknown as typeof WebSocket

    server.closeConnection()

    await waitUntil(() => hasThrown, { timeoutMs: 4_000 })
    await waitUntil(
      () => connectionStatus.is("connected"),
      {
        timeoutMs: 8_000,
      },
    )
  })

  test("recovers from a socket that only ever errors", async () => {
    const { server } = await mountSlatecast()
    expect(connectionStatus.getState().status).toBe(
      "connected",
    )

    server.closeConnection()

    // `reconnecting`, not `disconnected` — the distinction the boolean this
    // replaced could not carry, and the reason the shared machine has both.
    // A panel that lost its data says something different from one that never
    // had any.
    await waitUntil(
      () => connectionStatus.is("reconnecting"),
      { timeoutMs: 4_000 },
    )

    // The proxy reaping an idle socket is the routine case; the display must
    // come back on its own every time it happens.
    await waitUntil(
      () => connectionStatus.is("connected"),
      {
        timeoutMs: 8_000,
      },
    )
  })
})
