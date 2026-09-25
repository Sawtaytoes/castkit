import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PluginManifest } from "@castkit/sdk/plugin"
import { Hono } from "hono"
import { expect, test } from "vitest"
import { createPlatform } from "./platform.ts"
import { attachPlatformRoutes } from "./platformRoutes.ts"
import { createPluginArchive } from "./plugins/__fixtures__/packageArchive.ts"

const publisher = {
  isEnabled: false,
  publish: async () => {},
  subscribe: async () => {},
  close: async () => {},
}
const manifest = (version: string): PluginManifest => ({
  id: "example.source",
  name: "Example source",
  version,
  apiVersion: 1,
  adapters: [
    {
      id: "example-source",
      name: "Example",
      description: "Example",
      channelTypes: ["example.v1"],
      settings: [],
      channelSettings: [],
      actions: [],
    },
  ],
  viewSpecs: [],
})
const archive = ({
  version,
  hasContract = true,
}: {
  version: string
  hasContract?: boolean
}) =>
  createPluginArchive({
    version,
    manifest: manifest(version),
    files: {
      "dist/server.js": `export default {manifest:${JSON.stringify(manifest(version))},contracts:${hasContract ? '{"example.v1":{parse(data){if(typeof data.value!=="string")throw new Error("Invalid value");return {value:data.value}}}}' : "{}"},adapters:{"example-source": context=>({start(){context.channels.forEach(channel=>context.publish({channelId:channel.id,data:{value:${JSON.stringify(version)}}}))},dispose(){}})}}`,
    },
  })

test("runtime package routes enforce management access and preserve live source configuration across updates and restart", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "castkit-plugin-runtime-"),
  )
  const file = join(directory, "platform.json")
  const platform = await createPlatform({ file, publisher })
  const app = new Hono()
  attachPlatformRoutes({ app, platform })
  const request = ({
    path,
    data,
    cookie = "",
    method = "POST",
    origin,
  }: {
    path: string
    data?: unknown
    cookie?: string
    method?: string
    origin?: string
  }) =>
    app.request(path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
        ...(origin ? { Origin: origin } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    })
  const base = "/api/manage/platform/plugin-packages"
  try {
    expect(
      (
        await app.request(`${base}/inspect-file`, {
          method: "POST",
          body: "invalid",
        })
      ).status,
    ).toBe(401)
    expect(
      (
        await request({
          path: `${base}/install`,
          data: { inspectionId: "unknown" },
        })
      ).status,
    ).toBe(401)
    const setup = await request({
      path: "/api/access/setup",
      data: {
        pin: "2468",
        setupToken: platform.store.get().setupToken,
      },
    })
    const cookie =
      setup.headers.get("set-cookie")?.split(";")[0] ?? ""
    expect(
      (
        await request({
          path: `${base}/install`,
          data: { inspectionId: "unknown" },
          cookie,
          origin: "https://another.example",
        })
      ).status,
    ).toBe(403)
    const install = async (bytes: Buffer) => {
      const inspected = await app.request(
        `${base}/inspect-file`,
        {
          method: "POST",
          headers: {
            Cookie: cookie,
            "Content-Type": "application/gzip",
          },
          body: new Uint8Array(bytes),
        },
      )
      expect(inspected.status).toBe(200)
      const { inspectionId } = await inspected.json()
      return request({
        path: `${base}/install`,
        data: { inspectionId },
        cookie,
      })
    }
    expect(
      (await install(archive({ version: "1.0.0" }))).status,
    ).toBe(200)
    expect(
      (
        await request({
          path: "/api/manage/platform/sources",
          cookie,
          data: {
            id: "example",
            name: "Example",
            adapter: "example-source",
            settings: {},
            isEnabled: true,
          },
        })
      ).status,
    ).toBe(201)
    expect(
      (
        await request({
          path: "/api/manage/platform/channels",
          cookie,
          data: {
            id: "example",
            name: "Example",
            sourceId: "example",
            type: "example.v1",
            settings: {},
          },
        })
      ).status,
    ).toBe(201)
    expect(platform.hub.get("example")?.data).toEqual({
      value: "1.0.0",
    })
    expect(
      (await install(archive({ version: "2.0.0" }))).status,
    ).toBe(200)
    expect(platform.hub.get("example")?.data).toEqual({
      value: "2.0.0",
    })
    expect(
      (
        await install(
          archive({ version: "3.0.0", hasContract: false }),
        )
      ).status,
    ).toBe(409)
    expect(platform.hub.get("example")?.data).toEqual({
      value: "2.0.0",
    })
    expect(platform.pluginRuntime.list()[0]?.version).toBe(
      "2.0.0",
    )
    expect(
      (
        await request({
          path: `${base}/example.source`,
          cookie,
          method: "DELETE",
        })
      ).status,
    ).toBe(409)
    await platform.dispose()
    const restarted = await createPlatform({
      file,
      publisher,
    })
    try {
      expect(
        restarted.pluginRuntime.list()[0]?.version,
      ).toBe("2.0.0")
      expect(restarted.hub.get("example")?.data).toEqual({
        value: "2.0.0",
      })
      expect(restarted.store.get().adminHash).toBeTruthy()
    } finally {
      await restarted.dispose()
    }
  } finally {
    await platform.dispose()
    await rm(directory, { recursive: true, force: true })
  }
})
