import {
  act,
  render,
  screen,
  waitFor,
} from "@testing-library/preact"
import { afterEach, expect, test, vi } from "vitest"
import { CameraSnapshot } from "./CameraSnapshot.tsx"

const imageBytes = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWNgYGAAAAAEAAGjChXjAAAAAElFTkSuQmCC",
  ),
  (character) => character.charCodeAt(0),
)
const response = () =>
  new Response(imageBytes, {
    headers: { "Content-Type": "image/png" },
  })
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

test("snapshot requests never overlap and exiting aborts acquisition without queued updates", async () => {
  vi.useFakeTimers()
  const pending = {
    finish: (_response: Response) => {},
    signal: undefined as AbortSignal | undefined,
  }
  const fetchRequest = vi
    .spyOn(window, "fetch")
    .mockImplementation((_input, options) => {
      pending.signal = options?.signal ?? undefined
      return new Promise<Response>((resolve) => {
        pending.finish = resolve
      })
    })
  const view = render(
    <CameraSnapshot
      url="/api/display/view/alert/media/camera"
      name="Door"
      intervalSeconds={1}
    />,
  )
  await waitFor(() =>
    expect(fetchRequest).toHaveBeenCalledTimes(1),
  )
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2500)
  })
  expect(fetchRequest).toHaveBeenCalledTimes(1)
  view.unmount()
  expect(pending.signal?.aborted).toBe(true)
  await act(async () => {
    pending.finish(response())
    await vi.advanceTimersByTimeAsync(10000)
  })
  expect(fetchRequest).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole("img")).toBeNull()
})

test("a failed first still retries and displays a real decoded frame with an acquisition timestamp", async () => {
  const fetchRequest = vi
    .spyOn(window, "fetch")
    .mockRejectedValueOnce(new Error("offline"))
    .mockImplementation(async () => response())
  render(
    <CameraSnapshot
      url="/api/display/view/alert/media/camera"
      name="Door"
      intervalSeconds={1}
      isSingleFrame
    />,
  )
  await waitFor(() =>
    expect(
      screen.getByText("Camera unavailable. Retrying."),
    ).toBeVisible(),
  )
  await waitFor(
    () =>
      expect(
        screen.getByRole("img", { name: "Door camera" }),
      ).toBeVisible(),
    { timeout: 3000 },
  )
  expect(screen.getByRole("status").textContent).toMatch(
    /^Image received /,
  )
  expect(fetchRequest).toHaveBeenCalledTimes(2)
})
