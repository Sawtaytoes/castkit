import { once } from "node:events"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { serve } from "@hono/node-server"
import { expect, test } from "@playwright/test"
import { createApp } from "../packages/server/src/app.ts"
import { loadConfig } from "../packages/server/src/config/env.ts"
import { createPlatform } from "../packages/server/src/platform/platform.ts"
import { hashPin } from "../packages/server/src/platform/platformStore.ts"
import { createPluginArchive } from "../packages/server/src/platform/plugins/__fixtures__/packageArchive.ts"
import { createDeviceDefinitionStore } from "../packages/server/src/state/deviceDefinitionStore.ts"
import { createDeviceStore } from "../packages/server/src/state/deviceStore.ts"
import { createRenderTokenStore } from "../packages/server/src/state/renderTokenStore.ts"

test("management uploads, reviews, installs, and removes a package with its retained PIN session", async ({
  page,
}) => {
  const directory = await mkdtemp(
    join(tmpdir(), "castkit-plugin-management-"),
  )
  const platform = await createPlatform({
    file: join(directory, "platform.json"),
    publisher: {
      isEnabled: false,
      publish: async () => {},
      subscribe: async () => {},
      close: async () => {},
    },
  })
  platform.store.update((previous) => ({
    ...previous,
    adminHash: hashPin("2468"),
  }))
  const app = createApp({
    config: loadConfig({}),
    platform,
    deviceStore: createDeviceStore({ deviceIds: [] }),
    deviceDefinitionStore: createDeviceDefinitionStore({
      devices: [],
      browserDevices: [],
      devicesFile: join(directory, "devices.json"),
    }),
    getDeviceSettings: () => null,
    onDeviceDefinitionsChanged: () => {},
    setDeviceSetting: async () => false,
    pushController: {
      deviceById: new Map(),
      renderDevice: async () => null,
      pushDevice: async () => false,
      setView: async () => false,
    },
    renderTokenStore: createRenderTokenStore(),
  })
  const server = serve({
    fetch: app.fetch,
    port: 0,
    hostname: "127.0.0.1",
  })
  await once(server, "listening")
  const address = server.address()
  if (!address || typeof address === "string")
    throw new Error("The fixture has no TCP port")
  const origin = `http://127.0.0.1:${address.port}`
  const failures = new Set<string>()
  const login = { count: 0 }
  page.on("pageerror", (error) => {
    failures.add(error.message)
  })
  page.on("request", (request) => {
    if (request.url() === `${origin}/api/access/login`)
      login.count += 1
  })
  const capture = async (name: string) => {
    const reviewDirectory =
      process.env.CASTKIT_PLUGIN_REVIEW_DIR
    if (!reviewDirectory) return
    await mkdir(reviewDirectory, { recursive: true })
    await page.screenshot({
      path: join(reviewDirectory, `${name}.png`),
      fullPage: true,
    })
  }
  try {
    await page.setViewportSize({ width: 1280, height: 960 })
    await page.goto(`${origin}/manage/plugins`)
    await page.getByLabel("Management PIN").fill("2468")
    await page
      .getByRole("button", { name: "Sign in", exact: true })
      .click()
    await expect(
      page.getByRole("button", {
        name: "Add plugin",
        exact: true,
      }),
    ).toBeVisible()
    await page.reload()
    await expect(
      page.getByRole("button", {
        name: "Add plugin",
        exact: true,
      }),
    ).toBeVisible()
    expect(login.count).toBe(1)
    await page
      .getByRole("button", {
        name: "Add plugin",
        exact: true,
      })
      .click()
    await expect(
      page.getByText("Upload a plugin package", {
        exact: true,
      }),
    ).toBeVisible()
    await capture("installer-upload")
    await page.locator('input[type="file"]').setInputFiles({
      name: "example-runtime.tgz",
      mimeType: "application/gzip",
      buffer: createPluginArchive(),
    })
    await expect(
      page.getByRole("button", {
        name: "Install plugin",
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      page.getByText("@example/runtime-plugin · 1.0.0", {
        exact: true,
      }),
    ).toBeVisible()
    const reviewed = await page.request.get(
      `${origin}/api/manage/platform`,
    )
    expect((await reviewed.json()).pluginPackages).toEqual(
      [],
    )
    await capture("installer-review")
    await page
      .getByRole("button", {
        name: "Install plugin",
        exact: true,
      })
      .click()
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Example runtime installed." }),
    ).toBeVisible()
    await expect(
      page.getByRole("button", {
        name: "Remove Example runtime",
        exact: true,
      }),
    ).toBeVisible()
    await capture("installer-complete")
    await page
      .getByRole("button", {
        name: "Remove Example runtime",
        exact: true,
      })
      .scrollIntoViewIfNeeded()
    await capture("installed-plugin")
    const installed = await page.request.get(
      `${origin}/api/manage/platform`,
    )
    expect((await installed.json()).pluginPackages).toEqual(
      [
        expect.objectContaining({
          pluginId: "example.runtime",
          version: "1.0.0",
        }),
      ],
    )
    await page
      .getByRole("button", {
        name: "Remove Example runtime",
        exact: true,
      })
      .click()
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Plugin removed." }),
    ).toBeVisible()
    await expect(
      page.getByRole("button", {
        name: "Remove Example runtime",
        exact: true,
      }),
    ).toHaveCount(0)
    const removed = await page.request.get(
      `${origin}/api/manage/platform`,
    )
    expect((await removed.json()).pluginPackages).toEqual(
      [],
    )
    expect(login.count).toBe(1)
    expect(Array.from(failures)).toEqual([])
  } finally {
    await page.close()
    await platform.dispose()
    await new Promise<void>((resolve) =>
      server.close(() => resolve()),
    )
    await rm(directory, { recursive: true, force: true })
  }
})
