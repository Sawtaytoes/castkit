import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MONOCHROME_PALETTE } from "@castkit/core/panels/palette"
import type {
  PluginManifest,
  ViewSpec,
} from "@castkit/sdk/plugin"
import { expect, test } from "vitest"
import { createPlatform } from "./platform.ts"
import { createPluginArchive } from "./plugins/__fixtures__/packageArchive.ts"

test.each([
  {
    change: { renderers: ["browser"] },
    reason: "does not support image delivery",
  },
  {
    change: { minimumRepaint: "instant" },
    reason: "requires instant repaint",
  },
  {
    change: { valueLifetimeMilliseconds: 1000 },
    reason: "changes too quickly",
  },
] satisfies {
  change: Partial<ViewSpec>
  reason: string
}[])("rejects a plugin update that $reason for an assigned physical display", async ({
  change,
  reason,
}) => {
  const directory = await mkdtemp(
    join(tmpdir(), "castkit-plugin-compatibility-"),
  )
  const platform = await createPlatform({
    file: join(directory, "platform.json"),
    publisher: {
      isEnabled: false,
      publish: async () => {},
      subscribe: async () => {},
      close: async () => {},
    },
    devices: [
      {
        id: "example-panel",
        label: "Example panel",
        mac: "02:00:00:00:00:01",
        width: 400,
        height: 300,
        colorMode: "monochrome",
        palette: MONOCHROME_PALETTE,
        rotation: 0,
        ditherProfile: {
          algorithm: "off",
          supersampleFactor: 1,
        },
        repaint: "slow",
        power: "wired",
      },
    ],
  })
  const install = async ({
    version,
    changes = {},
  }: {
    version: string
    changes?: Partial<ViewSpec>
  }) => {
    const manifest: PluginManifest = {
      id: "example.physical",
      name: "Example physical",
      version,
      apiVersion: 1,
      adapters: [],
      viewSpecs: [
        {
          id: "example-physical",
          name: "Example physical",
          description: "Synthetic physical display view",
          inputs: [],
          settings: [],
          renderers: ["browser", "image"],
          browserEntry: "dist/browser/view.js",
          minimumRepaint: "slow",
          valueLifetimeMilliseconds: 60000,
          ...changes,
        },
      ],
    }
    const inspection =
      await platform.pluginRuntime.inspectArchive({
        bytes: createPluginArchive({ version, manifest }),
      })
    return platform.pluginRuntime.install(
      inspection.inspectionId,
    )
  }
  try {
    await install({ version: "1.0.0" })
    platform.store.update((previous) => ({
      ...previous,
      views: [
        {
          id: "example-view",
          name: "Example view",
          layout: "single",
          panels: [
            {
              id: "main",
              specId: "example-physical",
              bindings: {},
              settings: {},
            },
          ],
          theme: "auto",
          access: "public",
          isControlEnabled: false,
        },
      ],
      screens: [
        {
          id: "example-screen",
          name: "Example screen",
          defaultViewId: "example-view",
          viewIds: ["example-view"],
          access: "public",
        },
      ],
      deviceScreens: { "example-panel": "example-screen" },
    }))
    await expect(
      install({ version: "2.0.0", changes: change }),
    ).rejects.toThrow(reason)
    expect(platform.pluginRuntime.list()[0]?.version).toBe(
      "1.0.0",
    )
    expect(
      platform.catalog.getViewSpec("example-physical"),
    ).toMatchObject({
      renderers: ["browser", "image"],
      minimumRepaint: "slow",
      valueLifetimeMilliseconds: 60000,
    })
    expect(platform.store.get().deviceScreens).toEqual({
      "example-panel": "example-screen",
    })
  } finally {
    await platform.dispose()
    await rm(directory, { recursive: true, force: true })
  }
})
