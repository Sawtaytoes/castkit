import {
  act,
  render,
  screen,
} from "@testing-library/preact"
import { HttpResponse, http } from "msw"
import { setupWorker } from "msw/browser"
import {
  afterAll,
  afterEach,
  beforeAll,
  expect,
  test,
  vi,
} from "vitest"
import { CameraImage } from "./CameraImage.tsx"

// A missing stream triggers the error-retry timer as well as the stall timer.
// Serve a valid still frame so these tests isolate pixel-based stall recovery.
const worker = setupWorker(
  http.get(
    "*/api/display/view/printers/media/camera",
    () =>
      new HttpResponse(
        Uint8Array.from(
          atob(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWNgYGAAAAAEAAGjChXjAAAAAElFTkSuQmCC",
          ),
          (character) => character.charCodeAt(0),
        ),
        { headers: { "Content-Type": "image/png" } },
      ),
  ),
)
beforeAll(() =>
  worker.start({
    quiet: true,
    onUnhandledRequest: "bypass",
  }),
)
afterAll(() => worker.stop())

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

test("a live camera reconnects when its displayed frame stops changing", async () => {
  vi.useFakeTimers()
  vi.spyOn(
    HTMLImageElement.prototype,
    "naturalWidth",
    "get",
  ).mockReturnValue(64)
  vi.spyOn(
    CanvasRenderingContext2D.prototype,
    "drawImage",
  ).mockImplementation(() => {})
  vi.spyOn(
    CanvasRenderingContext2D.prototype,
    "getImageData",
  ).mockReturnValue({
    data: new Uint8ClampedArray([10, 20, 30, 255]),
  } as ImageData)

  render(
    <CameraImage
      url="/api/display/view/printers/media/camera?kind=stream"
      name="Printer"
      isLive
    />,
  )
  const camera = screen.getByRole("img", {
    name: "Printer camera",
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(25_000)
  })
  expect(camera.isConnected).toBe(false)
  expect(
    screen.getByText("Reconnecting Printer camera…"),
  ).toBeVisible()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(8_000)
  })
  expect(
    screen
      .getByRole("img", { name: "Printer camera" })
      .getAttribute("src"),
  ).toContain("frame=1")
})

test("a changing live camera keeps its stream connection", async () => {
  vi.useFakeTimers()
  vi.spyOn(
    HTMLImageElement.prototype,
    "naturalWidth",
    "get",
  ).mockReturnValue(64)
  vi.spyOn(
    CanvasRenderingContext2D.prototype,
    "drawImage",
  ).mockImplementation(() => {})
  const frame = { value: 0 }
  vi.spyOn(
    CanvasRenderingContext2D.prototype,
    "getImageData",
  ).mockImplementation(
    () =>
      ({
        data: new Uint8ClampedArray([frame.value++]),
      }) as ImageData,
  )

  render(
    <CameraImage
      url="/api/display/view/printers/media/camera?kind=stream"
      name="Printer"
      isLive
    />,
  )
  const camera = screen.getByRole("img", {
    name: "Printer camera",
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(25_000)
  })
  expect(camera.getAttribute("src")).toBe(
    "/api/display/view/printers/media/camera?kind=stream",
  )
})
