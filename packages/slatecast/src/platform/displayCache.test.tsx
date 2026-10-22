import {
  render,
  screen,
  waitFor,
} from "@testing-library/preact"
import { setupWorker } from "msw/browser"
import { ws } from "msw/core/ws"
import {
  afterEach,
  expect,
  onTestFinished,
  test,
  vi,
} from "vitest"
import {
  clearDisplayCache,
  recallDisplay,
  rememberDisplay,
} from "./displayCache.ts"
import { compositionFixture } from "./fixtures.ts"
import type { DisplayTarget } from "./protocol.ts"
import { useDisplay } from "./useDisplay.ts"
import { useWarmDeviceViews } from "./useWarmDeviceViews.ts"

afterEach(() => {
  clearDisplayCache()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const target: DisplayTarget = {
  kind: "view",
  id: "warm-navigation",
}
const snapshot = {
  ...compositionFixture,
  target,
  view: { ...compositionFixture.view, id: target.id },
}

const Surface = ({
  selected,
}: {
  selected: DisplayTarget
}) => {
  const display = useDisplay(selected, true)
  return (
    <>
      <p>{display.snapshot?.view.name ?? "Loading"}</p>
      <button
        type="button"
        disabled={
          !display.isConnected ||
          !display.snapshot?.canControl
        }
      >
        Control
      </button>
      {display.isLocked ? <p>Locked</p> : null}
    </>
  )
}

test("a warm device view paints without HTTP and enables controls only after a fresh socket snapshot", async () => {
  rememberDisplay({ snapshot })
  const connection: { send?: (value: string) => void } = {}
  const worker = setupWorker(
    ws
      .link("*/view/warm-navigation/ws")
      .addEventListener("connection", ({ client }) => {
        connection.send = (value) => client.send(value)
      }),
  )
  await worker.start({
    quiet: true,
    onUnhandledRequest: "bypass",
  })
  onTestFinished(() => worker.stop())
  const fetch = vi
    .spyOn(window, "fetch")
    .mockRejectedValue(
      new Error("HTTP must not block a warm view"),
    )
  render(<Surface selected={target} />)
  expect(screen.getByText(snapshot.view.name)).toBeVisible()
  expect(screen.getByRole("button")).toBeDisabled()
  await waitFor(() => expect(connection.send).toBeDefined())
  connection.send?.(
    JSON.stringify({
      type: "snapshot",
      ...snapshot,
      view: { ...snapshot.view, name: "Fresh room data" },
    }),
  )
  await waitFor(() =>
    expect(
      screen.getByText("Fresh room data"),
    ).toBeVisible(),
  )
  expect(screen.getByRole("button")).toBeEnabled()
  connection.send?.(
    JSON.stringify({
      type: "snapshot",
      ...snapshot,
      view: { ...snapshot.view, name: "Fresh room data" },
    }),
  )
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => resolve()),
    ),
  )
  expect(screen.getByText("Fresh room data")).toBeVisible()
  expect(fetch).not.toHaveBeenCalled()
  connection.send?.(JSON.stringify({ type: "locked" }))
  await waitFor(() =>
    expect(screen.getByText("Locked")).toBeVisible(),
  )
  expect(screen.queryByText("Fresh room data")).toBeNull()
  expect(recallDisplay(target)).toBeNull()
})

test("a second warm target replaces the previous view before its network reply", async () => {
  const secondTarget: DisplayTarget = {
    kind: "view",
    id: "second-warm-view",
  }
  rememberDisplay({ snapshot })
  rememberDisplay({
    snapshot: {
      ...snapshot,
      target: secondTarget,
      view: {
        ...snapshot.view,
        id: secondTarget.id,
        name: "Second view",
      },
    },
  })
  const worker = setupWorker(
    ws
      .link("*/view/:viewId/ws")
      .addEventListener("connection", () => undefined),
  )
  await worker.start({
    quiet: true,
    onUnhandledRequest: "bypass",
  })
  onTestFinished(() => worker.stop())
  const fetch = vi
    .spyOn(window, "fetch")
    .mockRejectedValue(new Error("Unexpected HTTP"))
  const view = render(<Surface selected={target} />)
  expect(screen.getByText(snapshot.view.name)).toBeVisible()
  view.rerender(<Surface selected={secondTarget} />)
  expect(screen.getByText("Second view")).toBeVisible()
  expect(screen.queryByText(snapshot.view.name)).toBeNull()
  view.rerender(<Surface selected={target} />)
  expect(screen.getByText(snapshot.view.name)).toBeVisible()
  expect(fetch).not.toHaveBeenCalled()
})

test("the memory cache expires, isolates device context, and retains only eight views", () => {
  vi.useFakeTimers()
  rememberDisplay({ snapshot })
  expect(
    recallDisplay({
      ...target,
      deviceId: "another-device",
    }),
  ).toBeNull()
  Array.from({ length: 8 }, (_, index) => index).forEach(
    (index) => {
      rememberDisplay({
        snapshot: {
          ...snapshot,
          target: { kind: "view", id: `view-${index}` },
        },
      })
    },
  )
  expect(recallDisplay(target)).toBeNull()
  expect(
    recallDisplay({ kind: "view", id: "view-7" }),
  ).not.toBeNull()
  vi.advanceTimersByTime(60_000)
  expect(
    recallDisplay({ kind: "view", id: "view-7" }),
  ).toBeNull()
})

const Warmer = ({
  targets,
}: {
  targets: DisplayTarget[]
}) => {
  useWarmDeviceViews(targets)
  return null
}

test("assigned views warm in the background and an access change discards a late response", async () => {
  const pending: {
    resolve?: (response: Response) => void
  } = {}
  const fetch = vi
    .spyOn(window, "fetch")
    .mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          pending.resolve = resolve
        }),
    )
  render(
    <Warmer
      targets={[
        target,
        { kind: "view", id: "another-view" },
      ]}
    />,
  )
  expect(fetch).not.toHaveBeenCalled()
  await waitFor(
    () => expect(fetch).toHaveBeenCalledTimes(1),
    { timeout: 3000 },
  )
  clearDisplayCache()
  pending.resolve?.(new Response(JSON.stringify(snapshot)))
  await new Promise((resolve) => setTimeout(resolve, 50))
  expect(recallDisplay(target)).toBeNull()
  expect(fetch).toHaveBeenCalledTimes(1)
})

test("assigned local compositions preload before they are selected", async () => {
  const fetch = vi
    .spyOn(window, "fetch")
    .mockResolvedValue(
      new Response(
        JSON.stringify({ ...snapshot, channels: {} }),
      ),
    )
  render(<Warmer targets={[target]} />)
  await waitFor(
    () =>
      expect(recallDisplay(target)?.view.id).toBe(
        target.id,
      ),
    { timeout: 3000 },
  )
  expect(fetch).toHaveBeenCalledWith(
    "/api/display/view/warm-navigation",
    expect.objectContaining({
      credentials: "same-origin",
      cache: "no-store",
    }),
  )
})

test("a device-context warm-up keeps its request identity when the wire target omits the device", async () => {
  const contextual = {
    ...target,
    deviceId: "configured-display",
  }
  const fetch = vi
    .spyOn(window, "fetch")
    .mockResolvedValue(
      new Response(
        JSON.stringify({ ...snapshot, channels: {} }),
      ),
    )
  render(<Warmer targets={[contextual]} />)
  await waitFor(
    () =>
      expect(recallDisplay(contextual)?.view.id).toBe(
        target.id,
      ),
    { timeout: 3000 },
  )
  expect(recallDisplay(target)).toBeNull()
  expect(fetch).toHaveBeenCalledWith(
    "/api/display/view/warm-navigation?device=configured-display&preload=1",
    expect.anything(),
  )
})

test("a locked configured view does not block warming the other assigned views", async () => {
  vi.spyOn(window, "fetch")
    .mockResolvedValueOnce(
      new Response("{}", { status: 401 }),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ...snapshot, channels: {} }),
      ),
    )
  render(
    <Warmer
      targets={[
        { kind: "view", id: "locked-assignment" },
        target,
      ]}
    />,
  )
  await waitFor(
    () =>
      expect(recallDisplay(target)?.view.id).toBe(
        target.id,
      ),
    { timeout: 3000 },
  )
  expect(
    recallDisplay({
      kind: "view",
      id: "locked-assignment",
    }),
  ).toBeNull()
})
