import type {
  CastKitPlugin,
  SourceContext,
} from "@castkit/sdk/plugin"
import { expect, test, vi } from "vitest"
import { createChannelHub } from "./channelHub.ts"
import { createPlatformCatalog } from "./platformCatalog.ts"
import { createSourceRuntime } from "./sourceRuntime.ts"

const channel = {
  id: "points",
  name: "Points",
  sourceId: "source",
  type: "points.v1",
  settings: {},
}
const source = {
  id: "source",
  name: "Source",
  adapter: "test",
  settings: {},
  isEnabled: true,
}
const makePlugin = (factory: CastKitPlugin["adapters"]) =>
  ({
    manifest: {
      id: "example",
      name: "Example",
      version: "1.0.0",
      apiVersion: 1,
      adapters: [
        {
          id: "test",
          name: "Test",
          description: "Test source",
          channelTypes: ["points.v1"],
          settings: [],
          channelSettings: [],
          actions: [],
        },
      ],
      viewSpecs: [],
    },
    adapters: factory,
  }) satisfies CastKitPlugin
test("changed sources dispose previous adapters and ignore late values", async () => {
  const contexts: SourceContext[] = []
  const dispose = vi.fn()
  const plugin = makePlugin({
    test: (context) => {
      contexts[contexts.length] = context
      return { dispose }
    },
  })
  const catalog = createPlatformCatalog({
    plugins: [plugin],
  })
  const hub = createChannelHub({
    contracts: catalog.contracts,
  })
  const runtime = createSourceRuntime({ hub, catalog })
  await runtime.configure({
    sources: [source],
    channels: [channel],
  })
  await runtime.configure({
    sources: [{ ...source, settings: { changed: true } }],
    channels: [channel],
  })
  expect(dispose).toHaveBeenCalledTimes(1)
  expect(contexts[0]?.signal.aborted).toBe(true)
  contexts[0]?.publish({
    channelId: "points",
    data: { name: "Old", total: 999 },
  })
  expect(hub.get("points")?.status).toBe("waiting")
  contexts[1]?.publish({
    channelId: "points",
    data: { name: "Current", total: 2 },
  })
  expect(hub.get("points")?.data).toEqual({
    name: "Current",
    total: 2,
  })
  runtime.dispose()
  hub.dispose()
})
test("a broken source factory produces channel errors without stopping the runtime", async () => {
  const catalog = createPlatformCatalog({
    plugins: [
      makePlugin({
        test: () => {
          throw new Error("Bad source")
        },
      }),
    ],
  })
  const hub = createChannelHub({
    contracts: catalog.contracts,
  })
  const runtime = createSourceRuntime({ hub, catalog })
  await runtime.configure({
    sources: [source],
    channels: [channel],
  })
  expect(hub.get("points")?.status).toBe("error")
  await expect(
    runtime.executeAction({
      channelId: "points",
      action: "toggle",
      payload: {},
    }),
  ).rejects.toThrow("does not support")
  runtime.dispose()
  hub.dispose()
})
