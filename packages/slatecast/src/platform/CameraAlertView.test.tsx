import {
  act,
  render,
  screen,
  waitFor,
} from "@testing-library/preact"
import { afterEach, expect, test, vi } from "vitest"
import { cameraAlertSnapshot } from "./__fixtures__/cameraAlert.ts"
import { CameraAlertView } from "./CameraAlertView.tsx"
import { DisplayPropertiesContext } from "./displayProperties.ts"
import { DisplayComposition } from "./PlatformApp.tsx"
import "../styles.css"
import "./platform.css"

afterEach(() => vi.restoreAllMocks())

test("camera alert preserves image aspect and fits its label and timestamp in each window", async () => {
  const imageBytes = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWNgYGAAAAAEAAGjChXjAAAAAElFTkSuQmCC",
    ),
    (character) => character.charCodeAt(0),
  )
  vi.spyOn(window, "fetch").mockImplementation(
    async () =>
      new Response(imageBytes, {
        headers: { "Content-Type": "image/png" },
      }),
  )
  render(
    <main class="platform" data-device="true">
      <DisplayComposition
        snapshot={cameraAlertSnapshot}
        isConnected
        onAction={async () => undefined}
      />
    </main>,
  )
  await waitFor(() =>
    expect(
      screen.getByRole("img", { name: "Entrance camera" }),
    ).toBeVisible(),
  )
  const media = screen.getByRole("img", {
    name: "Entrance camera",
  }) as HTMLImageElement
  expect(media.naturalWidth).toBeGreaterThan(0)
  expect(getComputedStyle(media).objectFit).toBe("contain")
  expect(
    document.documentElement.scrollHeight,
  ).toBeLessThanOrEqual(innerHeight)
  const status = screen
    .getByText(/^Image received /)
    .getBoundingClientRect()
  expect(status.bottom).toBeLessThanOrEqual(innerHeight)
  expect(
    screen.getByText("Entrance", { exact: true }),
  ).toBeVisible()
})

test.each([
  "browser",
  "image",
] as const)("fast %s delivery never opens a video stream", async (delivery) => {
  const fetchRequest = vi
    .spyOn(window, "fetch")
    .mockImplementation(() => new Promise(() => {}))
  render(
    <DisplayPropertiesContext.Provider
      value={{ delivery, repaint: "fast" }}
    >
      <CameraAlertView
        data={{
          cameras: [
            {
              id: "camera",
              name: "Entrance",
              isLive: true,
              format: "hls",
              url: "/api/display/view/alert/media/camera?kind=hls",
              snapshotUrl:
                "/api/display/view/alert/media/camera?kind=camera",
            },
          ],
        }}
        settings={{}}
      />
    </DisplayPropertiesContext.Provider>,
  )
  await waitFor(() =>
    expect(fetchRequest).toHaveBeenCalledTimes(1),
  )
  expect(fetchRequest.mock.calls[0]?.[0]).toContain(
    "kind=camera",
  )
  expect(document.querySelector("video")).toBeNull()
})

test("an instant browser shows snapshots during video startup and restores them on playback failure", async () => {
  const bytes = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWNgYGAAAAAEAAGjChXjAAAAAElFTkSuQmCC",
    ),
    (character) => character.charCodeAt(0),
  )
  vi.spyOn(window, "fetch").mockImplementation(
    async () =>
      new Response(bytes, {
        headers: { "Content-Type": "image/png" },
      }),
  )
  render(
    <DisplayPropertiesContext.Provider
      value={{ delivery: "browser", repaint: "instant" }}
    >
      <CameraAlertView
        data={{
          cameras: [
            {
              id: "camera",
              name: "Entrance",
              isLive: true,
              format: "hls",
              url: "/api/display/view/alert/media/camera?kind=hls",
              snapshotUrl:
                "/api/display/view/alert/media/camera?kind=camera",
            },
          ],
        }}
        settings={{}}
      />
    </DisplayPropertiesContext.Provider>,
  )
  await waitFor(() =>
    expect(
      screen.getByRole("img", { name: "Entrance camera" }),
    ).toBeVisible(),
  )
  const video = document.querySelector("video")!
  expect(video.muted).toBe(true)
  await act(async () => {
    video.dispatchEvent(
      new Event("loadeddata", { bubbles: true }),
    )
  })
  expect(screen.queryByRole("img")).toBeNull()
  await act(async () => {
    video.dispatchEvent(new Event("error"))
  })
  await waitFor(() =>
    expect(
      screen.getByRole("img", { name: "Entrance camera" }),
    ).toBeVisible(),
  )
})
