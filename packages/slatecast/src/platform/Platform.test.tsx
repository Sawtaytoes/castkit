import {
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { setupWorker } from "msw/browser"
import { ws } from "msw/core/ws"
import {
  afterEach,
  expect,
  onTestFinished,
  test,
  vi,
} from "vitest"
import { compositionFixture } from "./fixtures.ts"
import { PinKeypad } from "./PinKeypad.tsx"
import {
  DisplayComposition,
  PlatformApp,
} from "./PlatformApp.tsx"
import {
  type DisplaySnapshot,
  readDisplayTarget,
  safeMediaUrl,
} from "./protocol.ts"
import { RipDeckView } from "./RipDeckView.tsx"

afterEach(() => vi.restoreAllMocks())

test("composes independent channels and sends an action for the selected panel only", async () => {
  const onAction = vi.fn(async () => undefined)
  render(
    <DisplayComposition
      snapshot={compositionFixture}
      isConnected
      onAction={onAction}
    />,
  )
  expect(screen.getByText("Printer One")).toBeVisible()
  expect(screen.getByText("Sample movie")).toBeVisible()
  const user = userEvent.setup()
  await user.click(
    screen.getByRole("button", { name: "Pause" }),
  )
  await user.click(
    screen.getByRole("button", { name: "Confirm" }),
  )
  expect(onAction).toHaveBeenCalledWith({
    panelId: "printers",
    action: "pause",
    payload: { printerId: "printer-one" },
  })
})

test("stale or failed sources keep their last value and remove controls", () => {
  const snapshot = {
    ...compositionFixture,
    channels: {
      ...compositionFixture.channels,
      prints: {
        ...compositionFixture.channels.prints!,
        status: "error" as const,
        error: "Provider disconnected",
      },
    },
  }
  render(
    <DisplayComposition
      snapshot={snapshot}
      isConnected
      onAction={async () => undefined}
    />,
  )
  expect(
    screen.getByText(/Provider disconnected/),
  ).toBeVisible()
  expect(screen.getByText("Printer One")).toBeVisible()
  expect(
    screen.queryByRole("button", { name: "Pause" }),
  ).toBeNull()
})

test("a connection loss removes controls even when cached sources were ready", () => {
  render(
    <DisplayComposition
      snapshot={compositionFixture}
      isConnected={false}
      onAction={async () => undefined}
    />,
  )
  expect(
    screen.queryByRole("button", { name: "Pause" }),
  ).toBeNull()
})

test("Rip Deck details preserve cancel confirmation and prevent tray operations while ripping", async () => {
  const onAction = vi.fn(async () => undefined)
  render(
    <DisplayComposition
      snapshot={compositionFixture}
      isConnected
      onAction={onAction}
    />,
  )
  const user = userEvent.setup()
  await user.click(
    screen.getByRole("button", { name: /Sample movie/ }),
  )
  expect(
    screen.getByRole("button", { name: "Open" }),
  ).toBeDisabled()
  expect(
    screen.getByRole("button", { name: "Disc removed" }),
  ).toBeDisabled()
  await user.click(
    screen.getByRole("button", { name: "Cancel rip" }),
  )
  expect(onAction).not.toHaveBeenCalled()
  const dialog = screen.getByRole("alertdialog", {
    name: "Cancel this rip?",
  })
  expect(
    within(dialog).getByText(/partial output stays/),
  ).toBeVisible()
  expect(
    within(dialog).getByRole("button", {
      name: "Cancel rip",
    }),
  ).toHaveAttribute(
    "data-castkit-target",
    expect.stringContaining("confirm-cancel:bay-one:"),
  )
  expect(
    screen.getByRole("button", { name: "Back" }),
  ).toHaveAttribute(
    "data-castkit-target",
    expect.stringContaining("back:bay-one:"),
  )
  await user.click(
    within(dialog).getByRole("button", {
      name: "Cancel rip",
    }),
  )
  expect(onAction).toHaveBeenCalledWith({
    panelId: "discs",
    action: "cancel",
    payload: { driveId: "bay-one" },
  })
})

test("the touch PIN keypad clears the secret after submitting", async () => {
  const onUnlock = vi.fn(async () => undefined)
  render(
    <PinKeypad
      name="Private view"
      error=""
      isPending={false}
      onUnlock={onUnlock}
    />,
  )
  const user = userEvent.setup()
  await user.click(
    screen.getByRole("button", { name: "1", exact: true }),
  )
  await user.click(
    screen.getByRole("button", { name: "2", exact: true }),
  )
  await user.click(
    screen.getByRole("button", { name: "Delete" }),
  )
  await user.click(
    screen.getByRole("button", { name: "3", exact: true }),
  )
  await user.click(
    screen.getByRole("button", {
      name: "Unlock",
      exact: true,
    }),
  )
  expect(onUnlock).toHaveBeenCalledWith("13")
  expect(screen.getByLabelText("PIN")).toHaveValue("")
})

test("the browser route never captures legacy device URLs or remote media", () => {
  expect(readDisplayTarget("/screen/desk")).toEqual({
    kind: "screen",
    id: "desk",
  })
  expect(readDisplayTarget("/view/prints")).toEqual({
    kind: "view",
    id: "prints",
  })
  expect(readDisplayTarget("/d/panel")).toBeNull()
  expect(
    safeMediaUrl("https://example.com/private.jpg"),
  ).toBeUndefined()
  expect(
    safeMediaUrl("//example.com/private.jpg"),
  ).toBeUndefined()
  expect(safeMediaUrl("/api/media/photo")).toBe(
    "/api/media/photo",
  )
})

test("the page restores a server session and responds to a screen switch through one subscription", async () => {
  const link = ws.link("*/screen/desk/ws")
  const connections: {
    client?: {
      send: (value: string) => void
      close: () => void
    }
  } = {}
  const worker = setupWorker(
    link.addEventListener("connection", ({ client }) => {
      connections.client = client
    }),
  )
  await worker.start({
    quiet: true,
    onUnhandledRequest: "bypass",
  })
  onTestFinished(() => worker.stop())
  const fetch = vi.spyOn(window, "fetch").mockResolvedValue(
    new Response(JSON.stringify(compositionFixture), {
      status: 200,
    }),
  )
  const view = render(
    <PlatformApp target={{ kind: "screen", id: "desk" }} />,
  )
  onTestFinished(() => {
    view.unmount()
  })
  await waitFor(() =>
    expect(screen.getByText("Printer One")).toBeVisible(),
  )
  await waitFor(() =>
    expect(connections.client).toBeDefined(),
  )
  connections.client?.send(
    JSON.stringify({
      type: "snapshot",
      ...compositionFixture,
      view: {
        ...compositionFixture.view,
        name: "Changed by automation",
        panels: [
          {
            id: "clock",
            specId: "clock",
            bindings: {},
            settings: {},
          },
        ],
      },
    }),
  )
  await waitFor(() =>
    expect(
      screen.getByText("Changed by automation"),
    ).toBeVisible(),
  )
  expect(screen.queryByText("Printer One")).toBeNull()
  expect(fetch).toHaveBeenCalledWith(
    "/api/display/screen/desk",
    expect.objectContaining({ credentials: "same-origin" }),
  )
  connections.client?.close()
  await waitFor(() =>
    expect(
      screen.getByText(/Connection lost/),
    ).toBeVisible(),
  )
})

test("private data stays hidden until the server accepts the PIN", async () => {
  const fetch = vi.spyOn(window, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        error: "locked",
        name: "Private display",
      }),
      { status: 401 },
    ),
  )
  const view = render(
    <PlatformApp
      target={{ kind: "view", id: "private" }}
    />,
  )
  onTestFinished(() => {
    view.unmount()
  })
  await waitFor(() =>
    expect(
      screen.getByText("Private display"),
    ).toBeVisible(),
  )
  expect(screen.queryByText("Printer One")).toBeNull()
  fetch.mockImplementation(async (path) =>
    path === "/api/access/unlock"
      ? new Response("{}", { status: 403 })
      : new Response(JSON.stringify({ error: "locked" }), {
          status: 401,
        }),
  )
  const user = userEvent.setup()
  await user.click(
    screen.getByRole("button", { name: "1", exact: true }),
  )
  await user.click(
    screen.getByRole("button", {
      name: "Unlock",
      exact: true,
    }),
  )
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The PIN was not accepted.",
    ),
  )
  expect(fetch).toHaveBeenCalledWith(
    "/api/access/unlock",
    expect.objectContaining({
      body: JSON.stringify({
        kind: "view",
        id: "private",
        pin: "1",
      }),
    }),
  )
})

test("Rip Deck retains preparing bays even when cancellation is not yet offered", () => {
  const snapshot = structuredClone(compositionFixture)
  snapshot.channels.rips = {
    id: "rips",
    type: "rip-deck.v1",
    status: "ready",
    data: {
      bays: [
        {
          id: "bay-one",
          name: "1",
          title: "Preparing movie",
          state: "settling",
          percent: 0,
          actions: [],
          hasDisc: true,
          isPresent: true,
          isQuarantined: false,
        },
      ],
      alerts: [],
      isPresent: true,
      activeCount: 1,
      loadedDiscCount: 1,
    },
  }
  render(
    <DisplayComposition
      snapshot={snapshot}
      isConnected
      onAction={async () => undefined}
    />,
  )
  expect(
    screen.getByRole("button", { name: /Preparing movie/ }),
  ).toBeVisible()
})

test("a replacement rip with the same title cannot reuse the earlier job's confirmation", async () => {
  const data = {
    bays: [
      {
        id: "bay-one",
        jobId: "job-one",
        name: "1",
        title: "Same movie",
        state: "ripping",
        percent: 5,
        actions: ["cancel"],
        hasDisc: true,
        isPresent: true,
        isQuarantined: false,
      },
    ],
    alerts: [],
    isPresent: true,
    activeCount: 1,
    loadedDiscCount: 1,
  }
  const onAction = vi.fn(async () => undefined)
  const view = render(
    <RipDeckView
      data={data}
      isControlEnabled
      onAction={onAction}
    />,
  )
  const user = userEvent.setup()
  await user.click(
    screen.getByRole("button", { name: /Same movie/ }),
  )
  await user.click(
    screen.getByRole("button", { name: "Cancel rip" }),
  )
  view.rerender(
    <RipDeckView
      data={{
        ...data,
        bays: data.bays.map((bay) => ({
          ...bay,
          jobId: "job-two",
        })),
      }}
      isControlEnabled
      onAction={onAction}
    />,
  )
  const confirm = within(
    screen.getByRole("alertdialog"),
  ).getByRole("button", { name: "Cancel rip" })
  expect(confirm).toBeDisabled()
  await user.click(confirm)
  expect(onAction).not.toHaveBeenCalled()
})

test("one screen PIN grants dropdown and internal-link navigation without changing the URL", async () => {
  const link = ws.link("*/screen/desk/ws")
  const worker = setupWorker(
    link.addEventListener("connection", () => {}),
  )
  await worker.start({
    quiet: true,
    onUnhandledRequest: "bypass",
  })
  onTestFinished(() => worker.stop())
  const activity: DisplaySnapshot = {
    ...compositionFixture,
    target: { kind: "screen", id: "desk" },
    view: { ...compositionFixture.view, access: "pin" },
    screen: {
      id: "desk",
      name: "Protected screen",
      access: "pin",
      defaultViewId: "activity",
      viewIds: ["activity", "clock"],
    },
    availableViews: [
      { id: "activity", name: "Activity" },
      { id: "clock", name: "Clock view" },
    ],
  }
  const clock: DisplaySnapshot = {
    ...activity,
    view: {
      ...activity.view,
      id: "clock",
      name: "Clock view",
      layout: "single",
      panels: [
        {
          id: "links",
          specId: "entities",
          bindings: { data: "links" },
          settings: {
            links: [
              {
                name: "Back to activity",
                url: "/view/activity",
              },
              { name: "Other view", url: "/view/unlisted" },
              {
                name: "External",
                url: "https://example.com/view/activity",
              },
            ],
          },
        },
      ],
    },
    channels: {
      links: {
        id: "links",
        type: "entities.v1",
        status: "ready",
        data: { entities: [] },
      },
    },
  }
  let isUnlocked = false
  const fetch = vi
    .spyOn(window, "fetch")
    .mockImplementation(async (path, options) => {
      if (path === "/api/access/unlock") {
        isUnlocked = true
        return new Response("{}")
      }
      if (!isUnlocked)
        return new Response(
          JSON.stringify({
            error: "locked",
            name: "Protected screen",
          }),
          { status: 401 },
        )
      if (path === "/api/display/screen/desk/select") {
        const { viewId } = JSON.parse(String(options?.body))
        return new Response(
          JSON.stringify(
            viewId === "clock" ? clock : activity,
          ),
        )
      }
      return new Response(JSON.stringify(activity))
    })
  const originalUrl = window.location.href
  const view = render(
    <PlatformApp target={{ kind: "screen", id: "desk" }} />,
  )
  onTestFinished(() => {
    view.unmount()
  })
  await screen.findByText("Protected screen")
  const user = userEvent.setup()
  for (const digit of ["1", "3", "5", "7"])
    await user.click(
      screen.getByRole("button", {
        name: digit,
        exact: true,
      }),
    )
  await user.click(
    screen.getByRole("button", {
      name: "Unlock",
      exact: true,
    }),
  )
  await waitFor(() =>
    expect(
      screen.getByRole("combobox", { name: "View" }),
    ).toBeEnabled(),
  )
  await user.selectOptions(
    screen.getByRole("combobox", { name: "View" }),
    "clock",
  )
  await screen.findByRole("heading", {
    name: "Clock view",
    exact: true,
  })
  for (const name of ["Other view", "External"]) {
    let isPrevented = true
    document.addEventListener(
      "click",
      (event) => {
        isPrevented = event.defaultPrevented
        event.preventDefault()
      },
      { once: true },
    )
    screen.getByRole("link", { name }).dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        button: 0,
      }),
    )
    expect(isPrevented).toBe(false)
  }
  screen
    .getByRole("link", { name: "Back to activity" })
    .focus()
  await user.keyboard("{Enter}")
  await screen.findByText("Printer One")
  expect(window.location.href).toBe(originalUrl)
  expect(
    fetch.mock.calls.filter(
      ([path]) => path === "/api/access/unlock",
    ),
  ).toHaveLength(1)
  expect(
    fetch.mock.calls.filter(
      ([path]) =>
        path === "/api/display/screen/desk/select",
    ),
  ).toHaveLength(2)
  expect(
    fetch.mock.calls.some(([path]) =>
      String(path).startsWith("/api/display/view/"),
    ),
  ).toBe(false)
  expect(screen.queryByLabelText("PIN")).toBeNull()
})

test("a physical screen shows view navigation only when its drawer is enabled", async () => {
  const link = ws.link(/\/screen\/desk\/ws/)
  const connections: { send?: (message: string) => void } =
    {}
  const worker = setupWorker(
    link.addEventListener("connection", ({ client }) => {
      connections.send = (message) => client.send(message)
    }),
  )
  await worker.start({
    quiet: true,
    onUnhandledRequest: "bypass",
  })
  onTestFinished(() => worker.stop())
  const snapshot: DisplaySnapshot = {
    ...compositionFixture,
    availableViews: [{ id: "activity", name: "Activity" }],
    displayProperties: {
      repaint: "instant",
      hasViewDrawer: false,
    },
  }
  vi.spyOn(window, "fetch").mockImplementation(
    async () => new Response(JSON.stringify(snapshot)),
  )
  const view = render(
    <PlatformApp
      target={{
        kind: "screen",
        id: "desk",
        deviceId: "panel",
      }}
    />,
  )
  onTestFinished(() => {
    view.unmount()
  })
  await screen.findByText("Printer One")
  expect(
    screen.queryByRole("combobox", { name: "View" }),
  ).toBeNull()
  await waitFor(() =>
    expect(connections.send).toBeDefined(),
  )
  connections.send?.(
    JSON.stringify({
      type: "snapshot",
      ...snapshot,
      displayProperties: {
        repaint: "instant",
        hasViewDrawer: true,
      },
    }),
  )
  await waitFor(() =>
    expect(
      screen.getByRole("combobox", { name: "View" }),
    ).toBeVisible(),
  )
})

test("a preview receives live updates without exposing device actions or screen selection", async () => {
  const originalUrl = window.location.href
  window.history.replaceState(null, "", "?preview=1")
  onTestFinished(() =>
    window.history.replaceState(null, "", originalUrl),
  )
  const connection: { send?: (message: string) => void } =
    {}
  const worker = setupWorker(
    ws
      .link("*/screen/desk/ws")
      .addEventListener("connection", ({ client }) => {
        connection.send = (message) => client.send(message)
      }),
  )
  await worker.start({
    quiet: true,
    onUnhandledRequest: "bypass",
  })
  onTestFinished(() => worker.stop())
  const snapshot: DisplaySnapshot = {
    ...compositionFixture,
    view: { ...compositionFixture.view, access: "pin" },
    availableViews: [{ id: "activity", name: "Activity" }],
    canControl: true,
  }
  vi.spyOn(window, "fetch").mockImplementation(
    async () => new Response(JSON.stringify(snapshot)),
  )
  const view = render(
    <PlatformApp target={{ kind: "screen", id: "desk" }} />,
  )
  onTestFinished(() => {
    view.unmount()
  })
  await screen.findByText("Printer One")
  await waitFor(() => expect(connection.send).toBeDefined())
  connection.send?.(
    JSON.stringify({
      type: "snapshot",
      ...snapshot,
      view: { ...snapshot.view, name: "Updated preview" },
    }),
  )
  await screen.findByRole("heading", {
    name: "Updated preview",
  })
  expect(
    screen.queryByRole("button", { name: "Pause" }),
  ).toBeNull()
  expect(
    screen.queryByRole("button", { name: "Lock" }),
  ).toBeNull()
  expect(
    screen.queryByRole("combobox", { name: "View" }),
  ).toBeNull()
  expect(
    screen.queryByText("Connection lost · Retrying"),
  ).toBeNull()
})
