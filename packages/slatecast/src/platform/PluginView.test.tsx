import type {
  BrowserRenderer,
  ViewHost,
} from "@castkit/sdk/subscription"
import {
  render,
  screen,
  waitFor,
} from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { expect, test, vi } from "vitest"
import { Panel } from "./Panel.tsx"
import { PluginView } from "./PluginView.tsx"
import { readInlineDisplayTarget } from "./protocol.ts"
import { useRenderReadiness } from "./RenderReadiness.ts"

const panel = {
  id: "custom",
  specId: "sample",
  bindings: { data: "value" },
  settings: { title: "Sample" },
}
const channels = {
  value: {
    id: "value",
    type: "points.v1",
    status: "ready" as const,
    data: { name: "Sample", total: 12 },
  },
}

test("a legacy dotted plugin receives bound channels and updates before it is destroyed", async () => {
  const update = vi.fn()
  const destroy = vi.fn()
  const received: { host?: ViewHost } = {}
  const mount = vi.fn(
    (element: HTMLElement, host: ViewHost) => {
      element.textContent = "Custom view mounted"
      received.host = host
      return { update, destroy }
    },
  )
  const loadRenderer = vi.fn(
    async (): Promise<BrowserRenderer> => ({ mount }),
  )
  const onAction = vi.fn(async () => undefined)
  const view = render(
    <PluginView
      entry="/assets/plugins/example.clock/view.js"
      panel={panel}
      channels={channels}
      isControlEnabled
      onAction={onAction}
      loadRenderer={loadRenderer}
    />,
  )
  await waitFor(() =>
    expect(
      screen.getByText("Custom view mounted"),
    ).toBeVisible(),
  )
  expect(received.host?.getChannel("data")?.data).toEqual({
    name: "Sample",
    total: 12,
  })
  expect(received.host?.getChannel("other")).toBeUndefined()
  await received.host?.executeAction({
    input: "data",
    action: "sample",
    payload: { value: 1 },
  })
  expect(onAction).toHaveBeenCalledWith({
    panelId: "custom",
    action: "sample",
    input: "data",
    payload: { value: 1 },
  })
  view.rerender(
    <PluginView
      entry="/assets/plugins/example.clock/view.js"
      panel={panel}
      channels={channels}
      isControlEnabled={false}
      onAction={onAction}
      loadRenderer={loadRenderer}
    />,
  )
  await waitFor(() =>
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ isControlEnabled: false }),
    ),
  )
  expect(loadRenderer).toHaveBeenCalledTimes(1)
  view.unmount()
  expect(destroy).toHaveBeenCalledTimes(1)
})

test.each([
  "/assets/plugins/../secret.js",
  "/api/plugins/assets/version/../secret.js",
  "/api/plugins/assets/version/%2e%2e/secret.js",
  "/api/plugins/assets/version/browser.js?redirect=remote",
  "https://example.invalid/plugin.js",
  "//example.invalid/plugin.js",
])("a plugin rejects an unauthorized asset path: %s", async (entry) => {
  const loadRenderer = vi.fn()
  render(
    <PluginView
      entry={entry}
      panel={panel}
      channels={channels}
      isControlEnabled={false}
      onAction={async () => undefined}
      loadRenderer={loadRenderer}
    />,
  )
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "no valid browser asset",
    ),
  )
  expect(loadRenderer).not.toHaveBeenCalled()
})

test("the device shell can select a platform screen without changing its URL", () => {
  const script = document.createElement("script")
  script.id = "castkit-platform-target"
  script.type = "application/json"
  script.textContent = JSON.stringify({
    kind: "screen",
    id: "wall-display",
  })
  document.body.append(script)
  expect(readInlineDisplayTarget()).toEqual({
    kind: "screen",
    id: "wall-display",
  })
  script.textContent = "{invalid json"
  expect(readInlineDisplayTarget()).toBeNull()
  script.remove()
})

test("custom panels use all declared input names and allow a source-free renderer", () => {
  const inputs = [
    {
      key: "time",
      label: "Clock",
      type: "time.v1",
      isRequired: true,
    },
    {
      key: "award",
      label: "Award",
      type: "points.v1",
      isRequired: true,
    },
    {
      key: "optional",
      label: "Optional",
      type: "points.v1",
      isRequired: false,
    },
  ]
  const bound = {
    ...panel,
    bindings: { time: "value", award: "other" },
  }
  const view = render(
    <Panel
      panel={bound}
      inputs={inputs}
      browserEntry="/invalid.js"
      channels={{
        ...channels,
        other: { ...channels.value, id: "other" },
      }}
      isControlEnabled
      onAction={async () => undefined}
    />,
  )
  expect(screen.queryByRole("status")).toBeNull()
  view.rerender(
    <Panel
      panel={bound}
      inputs={inputs}
      browserEntry="/invalid.js"
      channels={{
        ...channels,
        other: {
          ...channels.value,
          id: "other",
          status: "stale",
        },
      }}
      isControlEnabled
      onAction={async () => undefined}
    />,
  )
  expect(screen.getByRole("status")).toHaveTextContent(
    "Award: Data is out of date",
  )
  view.rerender(
    <Panel
      panel={{ ...panel, bindings: {} }}
      inputs={[]}
      browserEntry="/invalid.js"
      channels={{}}
      isControlEnabled
      onAction={async () => undefined}
    />,
  )
  expect(screen.queryByRole("status")).toBeNull()
})

test("image capture readiness waits for a deferred plugin mount", async () => {
  const pending: {
    resolve?: (value: BrowserRenderer) => void
  } = {}
  const loadRenderer = () =>
    new Promise<BrowserRenderer>((resolve) => {
      pending.resolve = resolve
    })
  const Harness = () => {
    const isReady = useRenderReadiness(panel)
    return (
      <main
        class="platform"
        data-testid="capture"
        data-castkit-ready={String(isReady)}
      >
        <PluginView
          entry="/assets/plugins/sample/view.js"
          panel={panel}
          channels={channels}
          isControlEnabled={false}
          onAction={async () => undefined}
          loadRenderer={loadRenderer}
        />
      </main>
    )
  }
  render(<Harness />)
  await waitFor(() => expect(pending.resolve).toBeDefined())
  expect(screen.getByTestId("capture")).toHaveAttribute(
    "data-castkit-ready",
    "false",
  )
  pending.resolve?.({
    mount: (element) => {
      element.textContent = "Ready plugin"
      return { update: () => {}, destroy: () => {} }
    },
  })
  await waitFor(() =>
    expect(screen.getByTestId("capture")).toHaveAttribute(
      "data-castkit-ready",
      "true",
    ),
  )
  expect(screen.getByText("Ready plugin")).toBeVisible()
})

test("runtime package versions mount without rebuilding and release the previous renderer", async () => {
  const notify = vi.fn()
  const destroy = vi.fn(() => {
    throw new Error("The plugin cleanup failed")
  })
  const loadRenderer = vi.fn(async (entry: string) => ({
    mount: (element: HTMLElement, host: ViewHost) => {
      const label = document.createElement("p")
      label.textContent = entry.includes("version-two")
        ? "Updated package"
        : "Installed package"
      element.append(label)
      host.subscribe(notify)
      return { update: () => {}, destroy }
    },
  }))
  const properties = {
    panel,
    channels,
    isControlEnabled: false,
    onAction: async () => undefined,
    loadRenderer,
  }
  const view = render(
    <PluginView
      {...properties}
      entry="/api/plugins/assets/version-one/browser/view.mjs"
    />,
  )
  await waitFor(() =>
    expect(
      screen.getByText("Installed package"),
    ).toBeVisible(),
  )
  view.rerender(
    <PluginView
      {...properties}
      entry="/api/plugins/assets/version-two/browser/view.mjs"
    />,
  )
  await waitFor(() =>
    expect(
      screen.getByText("Updated package"),
    ).toBeVisible(),
  )
  expect(screen.queryByText("Installed package")).toBeNull()
  expect(destroy).toHaveBeenCalledTimes(1)
  expect(loadRenderer).toHaveBeenCalledTimes(2)
  view.rerender(
    <PluginView
      {...properties}
      channels={{ ...channels }}
      entry="/api/plugins/assets/version-two/browser/view.mjs"
    />,
  )
  await waitFor(() =>
    expect(notify).toHaveBeenCalledTimes(1),
  )
  view.unmount()
  expect(destroy).toHaveBeenCalledTimes(2)
})

test("a failed runtime import becomes capture-ready and retries with a fresh module URL", async () => {
  const mount = (element: HTMLElement) => {
    element.textContent = "Recovered package"
    return { update: () => {}, destroy: () => {} }
  }
  const loadRenderer = vi
    .fn<() => Promise<BrowserRenderer>>()
    .mockRejectedValueOnce(new Error("Asset unavailable"))
    .mockResolvedValue({ mount })
  render(
    <PluginView
      entry="/api/plugins/assets/runtime-version/browser/view.js"
      panel={panel}
      channels={channels}
      isControlEnabled={false}
      onAction={async () => undefined}
      loadRenderer={loadRenderer}
    />,
  )
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Asset unavailable",
    ),
  )
  expect(
    document.querySelector("[data-castkit-plugin-ready]"),
  ).toHaveAttribute("data-castkit-plugin-ready", "true")
  await userEvent
    .setup()
    .click(
      screen.getByRole("button", { name: "Retry view" }),
    )
  await waitFor(() =>
    expect(
      screen.getByText("Recovered package"),
    ).toBeVisible(),
  )
  expect(loadRenderer).toHaveBeenLastCalledWith(
    expect.stringMatching(
      /^\/api\/plugins\/assets\/runtime-version\/browser\/view\.js\?retry=\d+$/,
    ),
  )
  expect(screen.queryByRole("alert")).toBeNull()
})

test("removing a plugin before its import finishes prevents a late mount", async () => {
  const pending: {
    resolve?: (module: BrowserRenderer) => void
  } = {}
  const loadRenderer = () =>
    new Promise<BrowserRenderer>((resolve) => {
      pending.resolve = resolve
    })
  const mount = vi.fn()
  const view = render(
    <PluginView
      entry="/api/plugins/assets/pending-version/browser/view.js"
      panel={panel}
      channels={channels}
      isControlEnabled={false}
      onAction={async () => undefined}
      loadRenderer={loadRenderer}
    />,
  )
  await waitFor(() => expect(pending.resolve).toBeDefined())
  view.unmount()
  pending.resolve?.({ mount })
  await Promise.resolve()
  expect(mount).not.toHaveBeenCalled()
})
