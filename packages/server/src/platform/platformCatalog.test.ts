import type { CastKitPlugin } from "@castkit/sdk/plugin"
import { expect, test } from "vitest"
import { createPlatformCatalog } from "./platformCatalog.ts"
import {
  parsePluginPackages,
  readInstalledPlugin,
} from "./sources/pluginLoader.ts"

const plugin: CastKitPlugin = {
  manifest: {
    id: "example.photos",
    name: "Example Photos",
    version: "1.0.0",
    apiVersion: 1,
    adapters: [],
    viewSpecs: [
      {
        id: "example-photo",
        name: "Example",
        description: "Example view",
        inputs: [
          {
            key: "image",
            label: "Image",
            type: "images.v1",
            isRequired: true,
          },
        ],
        settings: [],
        renderers: ["browser"],
        browserEntry: "/assets/plugins/example/photos.js",
      },
    ],
  },
}
test("trusted package views use the same input contracts as built-in views", () => {
  const catalog = createPlatformCatalog({
    plugins: [readInstalledPlugin({ default: plugin })],
  })
  const definition = {
    id: "view",
    name: "View",
    layout: "single" as const,
    panels: [
      {
        id: "panel",
        specId: "example-photo",
        bindings: { image: "channel" },
        settings: {},
      },
    ],
    theme: "dark" as const,
    access: "public" as const,
    isControlEnabled: false,
  }
  const channel = {
    id: "channel",
    name: "Channel",
    sourceId: "source",
    type: "images.v1",
    settings: {},
  }
  expect(() =>
    catalog.validateView(definition, [channel]),
  ).not.toThrow()
  expect(() =>
    catalog.validateView(definition, [
      { ...channel, type: "points.v1" },
    ]),
  ).toThrow("images.v1")
})
test("duplicate IDs, incompatible SDKs and remote plugin scripts fail closed", () => {
  expect(() =>
    createPlatformCatalog({ plugins: [plugin, plugin] }),
  ).toThrow("Duplicate")
  expect(() =>
    readInstalledPlugin({
      default: {
        ...plugin,
        manifest: { ...plugin.manifest, apiVersion: 99 },
      },
    }),
  ).toThrow("Unsupported")
  expect(() =>
    readInstalledPlugin({
      default: {
        ...plugin,
        manifest: {
          ...plugin.manifest,
          viewSpecs: [
            {
              ...plugin.manifest.viewSpecs[0],
              browserEntry:
                "https://untrusted.example/plugin.js",
            },
          ],
        },
      },
    }),
  ).toThrow("local assets")
  expect(
    parsePluginPackages({ packages: ["@example/photos"] }),
  ).toEqual(["@example/photos"])
  expect(() =>
    parsePluginPackages({
      packages: ["https://untrusted.example/plugin.js"],
    }),
  ).toThrow("npm package names")
})

test("bundled sources and view libraries are independently registered plugins", () => {
  const catalog = createPlatformCatalog()
  expect(
    catalog.plugins.filter(
      (plugin) => plugin.adapters.length,
    ),
  ).toHaveLength(6)
  const photos = catalog.plugins.find(
    (plugin) => plugin.id === "castkit.views.photos",
  )
  expect(photos?.viewSpecs.map((spec) => spec.id)).toEqual([
    "photo-frame",
  ])
  expect(photos?.adapters).toEqual([])
  expect(
    catalog.plugins
      .find(
        (plugin) => plugin.id === "castkit.views.agenda",
      )
      ?.presets?.[0]?.panels.map((panel) => panel.specId),
  ).toEqual(["calendar", "photo-frame"])
  expect(
    catalog.plugins.flatMap((plugin) => plugin.viewSpecs),
  ).toHaveLength(catalog.viewSpecs.length)
  expect(() =>
    createPlatformCatalog({
      plugins: [
        {
          ...plugin,
          contracts: {
            "images.v1": { parse: (data) => data },
          },
        },
      ],
    }),
  ).toThrow("Duplicate contract")
})

test("text panels optionally bind entity states for visibility conditions", () => {
  const catalog = createPlatformCatalog()
  const definition = {
    id: "instructions",
    name: "Instructions",
    layout: "single" as const,
    theme: "dark" as const,
    access: "public" as const,
    isControlEnabled: false,
    panels: [
      {
        id: "note",
        specId: "text",
        bindings: { conditions: "states" },
        settings: {
          content: "Check the power supply",
          visibleWhenJson: JSON.stringify({
            entityId: "binary_sensor.example",
            state: "on",
          }),
        },
      },
    ],
  }
  const channel = {
    id: "states",
    name: "States",
    sourceId: "events",
    type: "entities.v1",
    settings: {},
  }
  expect(() =>
    catalog.validateView(definition, [channel]),
  ).not.toThrow()
  expect(() =>
    catalog.validateView(
      {
        ...definition,
        panels: [{ ...definition.panels[0], bindings: {} }],
      },
      [],
    ),
  ).not.toThrow()
  expect(() =>
    catalog.validateView(definition, [
      { ...channel, type: "points.v1" },
    ]),
  ).toThrow("entities.v1")
})

test("live catalog replacement preserves consumer maps and rejects invalid replacements atomically", () => {
  const catalog = createPlatformCatalog()
  const contracts = catalog.contracts
  const factories = catalog.adapterFactories
  catalog.replacePlugins([plugin])
  expect(catalog.getViewSpec("example-photo")?.name).toBe(
    "Example",
  )
  expect(catalog.contracts).toBe(contracts)
  expect(catalog.adapterFactories).toBe(factories)
  expect(() =>
    catalog.replacePlugins([plugin, plugin]),
  ).toThrow("Duplicate plugin")
  expect(catalog.getViewSpec("example-photo")).toBeDefined()
  catalog.replacePlugins([])
  expect(
    catalog.getViewSpec("example-photo"),
  ).toBeUndefined()
  expect(catalog.contracts.has("images.v1")).toBe(true)
})

test("an extension cannot replace a built-in factory through an undeclared export", () => {
  expect(() =>
    createPlatformCatalog({
      plugins: [
        {
          ...plugin,
          adapters: { mqtt: () => ({ dispose: () => {} }) },
        },
      ],
    }),
  ).toThrow("declared adapters")
})
