import { once } from "node:events"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PluginManifest } from "@castkit/sdk/plugin"
import { serve } from "@hono/node-server"
import { expect, test } from "@playwright/test"
import { Hono } from "hono"
import { createBrowserMode } from "../packages/server/src/browser/browserMode.ts"
import { loadConfig } from "../packages/server/src/config/env.ts"
import { createPlatform } from "../packages/server/src/platform/platform.ts"
import { attachPlatformRoutes } from "../packages/server/src/platform/platformRoutes.ts"
import { attachPlatformSockets } from "../packages/server/src/platform/platformSockets.ts"
import { createPluginArchive } from "../packages/server/src/platform/plugins/__fixtures__/packageArchive.ts"
import { createPluginPackageManager } from "../packages/server/src/platform/plugins/pluginPackages.ts"

const manifest = (version: string): PluginManifest => ({
  id: "runtime-example",
  name: "Runtime example",
  apiVersion: 1,
  version,
  adapters: [],
  viewSpecs: [
    {
      id: "runtime-example",
      name: "Runtime example",
      description: "An independently packaged DOM renderer",
      inputs: [],
      settings: [],
      renderers: ["browser", "image"],
      browserEntry: "dist/browser/view.js",
    },
  ],
})

const archive = (version: string) =>
  createPluginArchive({
    version,
    manifest: manifest(version),
    files: {
      "dist/browser/view.js": `
export const mount = (container, host) => {
  const output = document.createElement("p");
  output.textContent = "Runtime package ${version}";
  container.append(output);
  const unsubscribe = host.subscribe(() => {});
  return {
    update() {},
    destroy() {
      unsubscribe();
      document.body.dataset.pluginDestroyCount = String(Number(document.body.dataset.pluginDestroyCount || 0) + 1);
      output.remove();
    }
  };
};`,
    },
  })

test("installs and replaces browser packages on a live display without a build or reload", async ({
  page,
  browser,
  playwright,
}) => {
  const directory = await mkdtemp(
    join(tmpdir(), "castkit-runtime-browser-"),
  )
  const apiToken = "runtime-browser-test-token"
  const publisher = {
    isEnabled: false,
    publish: async () => {},
    subscribe: async () => {},
    close: async () => {},
  }
  const platform = await createPlatform({
    file: join(directory, "platform.json"),
    apiToken,
    publisher,
    pluginManager: createPluginPackageManager({
      directory: join(directory, "plugins"),
    }),
  })
  const view = (specId: string) => ({
    id: "runtime-display",
    name: "Runtime display",
    layout: "single",
    theme: "dark",
    access: "public",
    isControlEnabled: false,
    panels: [
      { id: "content", specId, bindings: {}, settings: {} },
    ],
  })
  const app = new Hono()
  attachPlatformRoutes({ app, platform, apiToken })
  const browserMode = createBrowserMode({
    config: loadConfig({}),
    publisher,
    getGlobalClockConfig: () => ({
      isTwelveHour: false,
      isNumericDate: false,
    }),
  })
  const { injectWebSocket, upgradeWebSocket } =
    browserMode.attach(app)
  attachPlatformSockets({ app, platform, upgradeWebSocket })
  const server = serve({
    fetch: app.fetch,
    port: 0,
    hostname: "127.0.0.1",
  })
  injectWebSocket(server)
  await once(server, "listening")
  const address = server.address()
  if (!address || typeof address === "string")
    throw new Error("The fixture has no TCP port")
  const origin = `http://127.0.0.1:${address.port}`
  const request = await playwright.request.newContext({
    baseURL: origin,
    extraHTTPHeaders: {
      Authorization: `Bearer ${apiToken}`,
    },
  })
  const failures = new Set<string>()
  page.on("pageerror", (error) => {
    failures.add(error.message)
  })
  const sockets = { count: 0 }
  page.on("websocket", () => {
    sockets.count += 1
  })
  const install = async (version: string) => {
    const inspected = await request.post(
      "/api/manage/platform/plugin-packages/inspect-file",
      {
        data: archive(version),
        headers: { "Content-Type": "application/gzip" },
      },
    )
    expect(inspected.ok(), await inspected.text()).toBe(
      true,
    )
    const inspection = await inspected.json()
    const installed = await request.post(
      "/api/manage/platform/plugin-packages/install",
      {
        data: { inspectionId: inspection.inspectionId },
      },
    )
    expect(installed.ok(), await installed.text()).toBe(
      true,
    )
  }
  const selectRenderer = async (specId: string) => {
    const response = await request.put(
      "/api/manage/platform/views/runtime-display",
      { data: view(specId) },
    )
    expect(response.ok(), await response.text()).toBe(true)
  }
  try {
    const created = await request.post(
      "/api/manage/platform/views",
      { data: view("clock") },
    )
    expect(created.ok(), await created.text()).toBe(true)
    await page.goto(`${origin}/view/runtime-display`)
    await expect(
      page.locator(".platform-clock"),
    ).toBeVisible()
    const loadedAt = await page.evaluate(
      () => performance.timeOrigin,
    )
    await install("1.0.0")
    const download = { hasFailed: false }
    await page.route(
      "**/api/plugins/assets/**",
      async (route) => {
        if (!download.hasFailed) {
          download.hasFailed = true
          await route.abort("failed")
        } else {
          await route.continue()
        }
      },
    )
    await selectRenderer("runtime-example")
    await expect(page.getByRole("alert")).toBeVisible()
    await page
      .getByRole("button", { name: "Retry view" })
      .click()
    await expect(
      page.getByText("Runtime package 1.0.0", {
        exact: true,
      }),
    ).toBeVisible()
    const firstSnapshot = await request.get(
      "/api/display/view/runtime-display",
    )
    const firstEntry = (
      await firstSnapshot.json()
    ).viewSpecs.find(
      (spec: { id: string }) =>
        spec.id === "runtime-example",
    ).browserEntry
    expect(firstEntry).toMatch(/^\/api\/plugins\/assets\//)
    await install("2.0.0")
    await expect(
      page.getByText("Runtime package 2.0.0", {
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      page.getByText("Runtime package 1.0.0", {
        exact: true,
      }),
    ).toHaveCount(0)
    await expect(page.locator("body")).toHaveAttribute(
      "data-plugin-destroy-count",
      "1",
    )
    const secondSnapshot = await request.get(
      "/api/display/view/runtime-display",
    )
    const secondEntry = (
      await secondSnapshot.json()
    ).viewSpecs.find(
      (spec: { id: string }) =>
        spec.id === "runtime-example",
    ).browserEntry
    expect(secondEntry).not.toBe(firstEntry)
    expect(
      (
        await request.delete(
          "/api/manage/platform/plugin-packages/runtime-example",
        )
      ).status(),
    ).toBe(409)

    const capture = await browser.newPage()
    const captureSockets = { count: 0 }
    capture.on("websocket", () => {
      captureSockets.count += 1
    })
    try {
      await capture.goto(
        `${origin}/view/runtime-display?capture=1`,
      )
      await expect(
        capture.getByText("Runtime package 2.0.0", {
          exact: true,
        }),
      ).toBeVisible()
      await expect(
        capture.locator("[data-castkit-ready]"),
      ).toHaveAttribute("data-castkit-ready", "true")
      expect(captureSockets.count).toBe(0)
    } finally {
      await capture.close()
    }

    await selectRenderer("clock")
    await expect(page.locator("body")).toHaveAttribute(
      "data-plugin-destroy-count",
      "2",
    )
    expect(
      (
        await request.put(
          "/api/manage/platform/plugins/runtime-example",
          { data: { isEnabled: false } },
        )
      ).ok(),
    ).toBe(true)
    expect(
      (
        await request.put(
          "/api/manage/platform/plugins/runtime-example",
          { data: { isEnabled: true } },
        )
      ).ok(),
    ).toBe(true)
    await selectRenderer("runtime-example")
    await expect(
      page.getByText("Runtime package 2.0.0", {
        exact: true,
      }),
    ).toBeVisible()
    await selectRenderer("clock")
    await expect(page.locator("body")).toHaveAttribute(
      "data-plugin-destroy-count",
      "3",
    )
    expect(
      (
        await request.delete(
          "/api/manage/platform/plugin-packages/runtime-example",
        )
      ).ok(),
    ).toBe(true)
    expect((await request.get(secondEntry)).status()).toBe(
      404,
    )
    expect(
      await page.evaluate(() => performance.timeOrigin),
    ).toBe(loadedAt)
    expect(sockets.count).toBe(1)
    expect(Array.from(failures)).toEqual([])
  } finally {
    await page.close()
    await request.dispose()
    await platform.dispose()
    await new Promise<void>((resolve) =>
      server.close(() => resolve()),
    )
    await rm(directory, { recursive: true, force: true })
  }
})
