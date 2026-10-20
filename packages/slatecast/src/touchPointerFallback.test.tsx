import {
  fireEvent,
  render,
  screen,
} from "@testing-library/preact"
import { useState } from "preact/hooks"
import { afterEach, expect, test, vi } from "vitest"
import {
  buildDeviceProfile,
  buildNowPlaying,
  buildSnapshot,
} from "./__fixtures__/buildSnapshot.ts"
import { mountSlatecast } from "./__tests__/setup/mountSlatecast.tsx"
import { waitUntil } from "./__tests__/setup/slatecastServer.ts"
import { EntitiesView } from "./platform/EntitiesView.tsx"
import {
  getIsTouchPointerFallbackRequired,
  installTouchPointerFallback,
} from "./touchPointerFallback.ts"

const cleanupState: { cleanups: (() => void)[] } = {
  cleanups: [],
}

afterEach(() => {
  cleanupState.cleanups.forEach((cleanup) => {
    cleanup()
  })
  cleanupState.cleanups = []
  vi.restoreAllMocks()
})

const beginTouch = ({
  target,
  clientX,
  clientY = 10,
}: {
  target: Element
  clientX: number
  clientY?: number
}) => {
  fireEvent.pointerDown(target, {
    pointerId: 2,
    pointerType: "touch",
    clientX,
    clientY,
  })
  target.dispatchEvent(
    new TouchEvent("touchstart", {
      bubbles: true,
      cancelable: true,
      changedTouches: [
        new Touch({
          identifier: 7,
          target,
          clientX,
          clientY,
        }),
      ],
    }),
  )
}

const continueTouch = ({
  target,
  clientX,
  clientY = 10,
  type = "touchmove",
}: {
  target: Element
  clientX: number
  clientY?: number
  type?: "touchmove" | "touchend" | "touchcancel"
}) => {
  // The broken backend sends movement/release to whatever is underneath,
  // despite the original control having requested pointer capture.
  fireEvent.pointerMove(document.body, {
    pointerId: 2,
    pointerType: "touch",
    clientX,
    clientY,
  })
  if (type === "touchend") {
    fireEvent.pointerCancel(target, {
      pointerId: 2,
      pointerType: "touch",
    })
    fireEvent.pointerUp(document.body, {
      pointerId: 2,
      pointerType: "touch",
      clientX,
      clientY,
    })
  }
  target.dispatchEvent(
    new TouchEvent(type, {
      bubbles: true,
      cancelable: true,
      changedTouches: [
        new Touch({
          identifier: 7,
          target,
          clientX,
          clientY,
        }),
      ],
    }),
  )
}

const install = () => {
  // Reproduce WPE accepting capture without keeping subsequent events there.
  vi.spyOn(
    Element.prototype,
    "setPointerCapture",
  ).mockImplementation(() => {})
  cleanupState.cleanups = cleanupState.cleanups.concat(
    installTouchPointerFallback(),
  )
}

test("uses the fallback for Linux WebKit without changing Chromium or Safari", () => {
  expect(
    getIsTouchPointerFallbackRequired(
      "Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/605.1.15 Version/60.5 Safari/605.1.15",
    ),
  ).toBe(true)
  expect(
    getIsTouchPointerFallbackRequired(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/145 Safari/537.36",
    ),
  ).toBe(false)
  expect(
    getIsTouchPointerFallbackRequired(
      "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/26 Safari/605.1.15",
    ),
  ).toBe(false)
})

test("opens the edge drawer after the finger leaves its narrow starting region", async () => {
  await mountSlatecast({
    snapshot: buildSnapshot({
      device: buildDeviceProfile({ hasViewDrawer: true }),
    }),
  })
  install()
  const edge = screen.getByRole("button", {
    name: "Open views from left edge",
  })
  beginTouch({ target: edge, clientX: 3 })
  continueTouch({ target: edge, clientX: 80 })
  await waitUntil(() =>
    Boolean(
      screen.queryByRole("button", { name: "Now Playing" }),
    ),
  )
  expect(
    screen.getByRole("button", { name: "Now Playing" }),
  ).toBeVisible()
})

test("keeps scrubbing local and emits one seek at the final touch position", async () => {
  const { server } = await mountSlatecast({
    snapshot: buildSnapshot({
      view: "now-playing",
      data: {
        nowPlaying: buildNowPlaying({
          isPlaying: false,
          positionSeconds: 0,
          durationSeconds: 200,
        }),
      },
    }),
  })
  install()
  const track = screen.getByRole("slider", { name: "Seek" })
  track.style.width = "200px"
  track.style.height = "20px"
  const bounds = track.getBoundingClientRect()
  beginTouch({ target: track, clientX: bounds.left + 20 })
  continueTouch({
    target: track,
    clientX: bounds.left + 100,
  })
  await waitUntil(
    () => track.getAttribute("aria-valuenow") === "100",
  )
  expect(track.getAttribute("aria-valuenow")).toBe("100")
  expect(server.commands).toEqual([])
  continueTouch({
    target: track,
    clientX: bounds.left + 150,
    type: "touchend",
  })
  await waitUntil(() => server.commands.length > 0)
  expect(server.commands).toEqual([
    { action: "seek", value: 150 },
  ])
})

test("does not consume native text input or synthesize a click after cancellation", () => {
  install()
  const range = document.createElement("input")
  range.type = "text"
  document.body.append(range)
  const listener = vi.fn()
  range.addEventListener("pointerdown", listener)
  beginTouch({ target: range, clientX: 20 })
  expect(listener).toHaveBeenCalledTimes(1)
  range.remove()

  const button = document.createElement("button")
  document.body.append(button)
  const click = vi.fn()
  button.addEventListener("click", click)
  beginTouch({ target: button, clientX: 20 })
  continueTouch({
    target: button,
    clientX: 20,
    type: "touchcancel",
  })
  expect(click).not.toHaveBeenCalled()
  button.remove()
})

test("tracks native range drags after pointers leave the control and commits once on release", () => {
  install()
  const range = document.createElement("input")
  range.type = "range"
  range.min = "1"
  range.max = "255"
  range.value = "128"
  range.style.width = "200px"
  document.body.append(range)
  const changed = vi.fn()
  const input = vi.fn()
  range.addEventListener("change", changed)
  range.addEventListener("input", input)
  const bounds = range.getBoundingClientRect()
  beginTouch({ target: range, clientX: bounds.left + 100 })
  continueTouch({
    target: range,
    clientX: bounds.left + 150,
  })
  expect(range.value).toBe("192")
  expect(input).toHaveBeenCalledTimes(1)
  expect(changed).not.toHaveBeenCalled()
  continueTouch({
    target: range,
    clientX: bounds.right + 100,
    type: "touchend",
  })
  expect(range.value).toBe("255")
  expect(changed).toHaveBeenCalledTimes(1)
  range.remove()
})

test("respects range direction, step and cancellation without changing mouse input", () => {
  install()
  const range = document.createElement("input")
  range.type = "range"
  range.min = "2000"
  range.max = "6500"
  range.step = "50"
  range.value = "4250"
  range.style.width = "200px"
  range.style.direction = "rtl"
  document.body.append(range)
  const changed = vi.fn()
  const pointerDown = vi.fn()
  range.addEventListener("change", changed)
  range.addEventListener("pointerdown", pointerDown)
  fireEvent.pointerDown(range, { pointerType: "mouse" })
  expect(pointerDown).toHaveBeenCalledTimes(1)
  const bounds = range.getBoundingClientRect()
  beginTouch({ target: range, clientX: bounds.left + 100 })
  continueTouch({
    target: range,
    clientX: bounds.left + 151,
  })
  expect(range.value).toBe("3100")
  continueTouch({
    target: range,
    clientX: bounds.left,
    type: "touchcancel",
  })
  expect(range.value).toBe("3100")
  expect(changed).not.toHaveBeenCalled()
  range.disabled = true
  beginTouch({ target: range, clientX: bounds.left })
  continueTouch({
    target: range,
    clientX: bounds.left,
    type: "touchend",
  })
  expect(range.value).toBe("3100")
  expect(changed).not.toHaveBeenCalled()
  range.remove()
})

test("a brightness range keeps its drag local and sends only the release value", () => {
  const request = vi.fn()
  const PendingControls = () => {
    const [isPending, setIsPending] = useState(false)
    return (
      <EntitiesView
        data={{
          entities: [
            {
              id: "light.test",
              name: "Test light",
              domain: "light",
              state: "on",
              attributes: { brightness: 128 },
              actions: ["turn_on", "turn_off"],
            },
          ],
        }}
        mode="entities"
        now={0}
        isControlEnabled={!isPending}
        onAction={async (action, payload) => {
          setIsPending(true)
          request({ action, payload })
        }}
      />
    )
  }
  render(<PendingControls />)
  install()
  const range = screen.getByRole("slider", {
    name: "Brightness",
  }) as HTMLInputElement
  range.style.width = "200px"
  const bounds = range.getBoundingClientRect()
  beginTouch({ target: range, clientX: bounds.left + 100 })
  continueTouch({
    target: range,
    clientX: bounds.left + 150,
  })
  expect(range.value).toBe("192")
  expect(range.isConnected).toBe(true)
  expect(request).not.toHaveBeenCalled()
  continueTouch({
    target: range,
    clientX: bounds.right + 40,
    type: "touchend",
  })
  expect(request).toHaveBeenCalledExactlyOnceWith({
    action: "turn_on",
    payload: { brightness: 255, entityId: "light.test" },
  })
})
