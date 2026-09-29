import {
  act,
  render,
  screen,
} from "@testing-library/preact"
import { afterEach, expect, test, vi } from "vitest"
import { CameraImage } from "./CameraImage.tsx"

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
  expect(camera.getAttribute("src")).toContain("frame=1")
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
