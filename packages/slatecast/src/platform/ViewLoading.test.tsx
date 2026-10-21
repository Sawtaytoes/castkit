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
import { buildDeviceProfile } from "../__fixtures__/buildSnapshot.ts"
import { DeviceApp } from "../DeviceApp.tsx"
import { readLocalDisplayTarget } from "../localDisplayTarget.ts"
import {
  activeView,
  device,
  deviceDisplayTarget,
} from "../state.ts"
import {
  compositionFixture,
  kidsPointsFixture,
} from "./fixtures.ts"
import { PlatformApp } from "./PlatformApp.tsx"
import { ViewTransition } from "./ViewTransition.tsx"
import "../styles.css"

afterEach(() => vi.restoreAllMocks())
const setup = async () => {
  const link = ws.link("*/view/*/ws*")
  const worker = setupWorker(
    link.addEventListener("connection", () => undefined),
  )
  await worker.start({
    quiet: true,
    onUnhandledRequest: "bypass",
  })
  onTestFinished(() => worker.stop())
  const responses = new Map<
    string,
    (response: Response) => void
  >()
  const fetch = vi
    .spyOn(window, "fetch")
    .mockImplementation(
      (path) =>
        new Promise<Response>((resolve) => {
          responses.set(String(path), resolve)
        }),
    )
  const answer = async (
    path: string,
    body: unknown,
    status = 200,
  ) => {
    await waitFor(() =>
      expect(responses.has(path)).toBe(true),
    )
    responses.get(path)?.(
      new Response(JSON.stringify(body), { status }),
    )
  }
  return { answer, fetch }
}

test("retains the old view while loading, disables its controls, and ignores a superseded response", async () => {
  const { answer, fetch } = await setup()
  const mounted = render(
    <PlatformApp
      target={{ kind: "view", id: "activity" }}
      isDeviceShell
    />,
  )
  onTestFinished(() => {
    mounted.unmount()
  })
  expect(
    screen.getByRole("status", { name: "" }).textContent,
  ).toBe("Loading view")
  await answer(
    "/api/display/view/activity",
    compositionFixture,
  )
  await screen.findByText("Printer One")
  const shell = document.querySelector(".platform")
  mounted.rerender(
    <PlatformApp
      target={{ kind: "view", id: "slow" }}
      isDeviceShell
    />,
  )
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      "/api/display/view/slow",
      expect.anything(),
    ),
  )
  expect(
    screen.getByRole("article", { name: "Printer One" }),
  ).toBeVisible()
  expect(
    document
      .querySelector(".platform-view")
      ?.hasAttribute("inert"),
  ).toBe(true)
  expect(screen.queryByText("Loading view")).toBeNull()
  mounted.rerender(
    <PlatformApp
      target={{ kind: "view", id: "kids-points" }}
      isDeviceShell
    />,
  )
  await answer(
    "/api/display/view/kids-points",
    kidsPointsFixture({ hasScan: false }),
  )
  await waitFor(() =>
    expect(
      document
        .querySelector(".platform")
        ?.getAttribute("data-view"),
    ).toBe("kids-points"),
  )
  await answer("/api/display/view/slow", compositionFixture)
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => resolve()),
  )
  expect(document.querySelector(".platform")).toBe(shell)
  expect(screen.queryByText("Printer One")).toBeNull()
})

test("a locked destination clears retained private content", async () => {
  const { answer } = await setup()
  const mounted = render(
    <PlatformApp
      target={{ kind: "view", id: "activity" }}
      isDeviceShell
    />,
  )
  onTestFinished(() => {
    mounted.unmount()
  })
  await answer(
    "/api/display/view/activity",
    compositionFixture,
  )
  await screen.findByText("Printer One")
  mounted.rerender(
    <PlatformApp
      target={{ kind: "view", id: "private" }}
      isDeviceShell
    />,
  )
  await answer(
    "/api/display/view/private",
    { name: "Private destination" },
    401,
  )
  await screen.findByText("Private destination")
  expect(screen.queryByText("Printer One")).toBeNull()
})

test("the device shell opens local CastKit links in place and survives a temporary target", async () => {
  const previous = {
    device: device.value,
    view: activeView.value,
    target: deviceDisplayTarget.value,
  }
  onTestFinished(() => {
    device.value = previous.device
    activeView.value = previous.view
    deviceDisplayTarget.value = previous.target
  })
  const { answer } = await setup()
  device.value = buildDeviceProfile({
    id: "test-panel",
    externalViews: [
      {
        name: "Activity",
        url: `${location.origin}/view/activity`,
      },
    ],
  })
  activeView.value = "external-view:0"
  deviceDisplayTarget.value = null
  const mounted = render(<DeviceApp />)
  onTestFinished(() => {
    mounted.unmount()
  })
  await answer(
    "/api/display/view/activity",
    compositionFixture,
  )
  await screen.findByText("Printer One")
  expect(document.querySelector("iframe")).toBeNull()
  const shell = document.querySelector(".platform")
  deviceDisplayTarget.value = {
    kind: "view",
    id: "kids-points",
  }
  await waitFor(() =>
    expect(
      document
        .querySelector(".platform-view")
        ?.hasAttribute("inert"),
    ).toBe(true),
  )
  expect(
    screen.getByRole("article", { name: "Printer One" }),
  ).toBeVisible()
  await answer(
    "/api/display/view/kids-points?device=test-panel",
    kidsPointsFixture({ hasScan: false }),
  )
  await waitFor(() =>
    expect(
      document
        .querySelector(".platform")
        ?.getAttribute("data-view"),
    ).toBe("kids-points"),
  )
  expect(document.querySelector(".platform")).toBe(shell)
})

test("external origins and decorated or unavailable links keep their external view behavior", () => {
  expect(
    readLocalDisplayTarget({
      url: `${location.origin}/view/points`,
    }),
  ).toEqual({ kind: "view", id: "points" })
  expect(
    readLocalDisplayTarget({
      url: "https://external.example/view/points",
    }),
  ).toBeNull()
  expect(
    readLocalDisplayTarget({
      url: "/view/points?preview=1",
    }),
  ).toBeNull()
  expect(
    readLocalDisplayTarget({
      url: "/view/points",
      zoom: 1.5,
    }),
  ).toBeNull()
  expect(
    readLocalDisplayTarget({
      url: "/view/points",
      isAvailable: false,
    }),
  ).toBeNull()
})

test("view motion runs once per navigation, and respects repaint and reduced motion", () => {
  const animate = vi.spyOn(HTMLElement.prototype, "animate")
  const mounted = render(
    <ViewTransition revision="one" isPending={false}>
      <p>First</p>
    </ViewTransition>,
  )
  expect(animate).toHaveBeenCalledTimes(0)
  mounted.rerender(
    <ViewTransition revision="one" isPending={false}>
      <p>Updated</p>
    </ViewTransition>,
  )
  expect(animate).toHaveBeenCalledTimes(0)
  mounted.rerender(
    <ViewTransition revision="two" isPending={false}>
      <p>Second</p>
    </ViewTransition>,
  )
  expect(animate).toHaveBeenCalledTimes(1)
  mounted.rerender(
    <ViewTransition
      revision="three"
      properties={{ repaint: "slow" }}
      isPending={false}
    >
      <p>Third</p>
    </ViewTransition>,
  )
  expect(animate).toHaveBeenCalledTimes(1)
  vi.spyOn(window, "matchMedia").mockReturnValue({
    matches: true,
  } as MediaQueryList)
  mounted.rerender(
    <ViewTransition revision="four" isPending={false}>
      <p>Fourth</p>
    </ViewTransition>,
  )
  expect(animate).toHaveBeenCalledTimes(1)
})
