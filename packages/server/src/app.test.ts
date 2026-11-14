import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from "vitest"
import { createApp } from "./app.ts"
import { loadConfig } from "./config/env.ts"
import { createDeviceDefinitionStore } from "./state/deviceDefinitionStore.ts"
import { createRenderTokenStore } from "./state/renderTokenStore.ts"

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])

const makeApp = ({
  render = async () => PNG as Buffer | null,
  rotation = "0",
} = {}) =>
  createApp({
    config: loadConfig({}),
    deviceStore: { getActiveView: () => "Clock" } as never,
    deviceDefinitionStore: createDeviceDefinitionStore({
      devices: loadConfig({}).devices,
      browserDevices: [],
      devicesFile: undefined,
    }),
    getDeviceSettings: () => ({ rotation }),
    onDeviceDefinitionsChanged: () => {},
    pushController: { renderDevice: render } as never,
    renderTokenStore: createRenderTokenStore(),
    setDeviceSetting: async () => false,
  })

describe("render token delivery", () => {
  test("mint, then fetch via the .png URL, returns the PNG (single-use)", async () => {
    const app = makeApp()

    const mint = await app.request(
      "/api/devices/m5paper/render",
      {
        method: "POST",
      },
    )
    expect(mint.status).toBe(200)
    const { token, url } = (await mint.json()) as {
      token: string
      url: string
    }
    // The URL the device is handed ends in `.png`.
    expect(url).toMatch(/\/render\/[0-9a-f]+\.png$/)

    // Fetching that exact `.png` URL must return the image — the `.png`
    // extension on the path param must not break the token lookup.
    const first = await app.request(`/render/${token}.png`)
    expect(first.status).toBe(200)
    expect(first.headers.get("content-type")).toBe(
      "image/png",
    )
    expect(Buffer.from(await first.arrayBuffer())).toEqual(
      PNG,
    )

    // Single-use: the token is evicted after the first fetch.
    const second = await app.request(`/render/${token}.png`)
    expect(second.status).toBe(404)
  })

  test("render for an unknown device 404s", async () => {
    const app = makeApp({ render: async () => null })
    const res = await app.request(
      "/api/devices/nope/render",
      {
        method: "POST",
      },
    )
    expect(res.status).toBe(404)
  })
})

describe("device automation settings", () => {
  test("reads and writes settings through the management API", async () => {
    const appliedSettings: {
      kind: string
      payload: string
    }[] = []
    const app = createApp({
      config: loadConfig({}),
      deviceStore: {
        getActiveView: () => "Clock",
      } as never,
      deviceDefinitionStore: createDeviceDefinitionStore({
        devices: loadConfig({}).devices,
        browserDevices: [],
        devicesFile: undefined,
      }),
      getDeviceSettings: (deviceId) =>
        deviceId === "inky-phat"
          ? { brightness: "100" }
          : null,
      onDeviceDefinitionsChanged: () => {},
      pushController: {} as never,
      renderTokenStore: createRenderTokenStore(),
      setDeviceSetting: async ({ kind, payload }) => {
        appliedSettings.push({ kind, payload })
        return true
      },
    })

    const getResponse = await app.request(
      "/api/manage/devices/inky-phat/settings",
    )
    expect(getResponse.status).toBe(200)
    expect(await getResponse.json()).toEqual({
      settings: { brightness: "100" },
    })

    const putResponse = await app.request(
      "/api/manage/devices/inky-phat/settings",
      {
        body: JSON.stringify({
          settings: [{ kind: "brightness", payload: "80" }],
        }),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      },
    )
    expect(putResponse.status).toBe(200)
    expect(appliedSettings).toEqual([
      { kind: "brightness", payload: "80" },
    ])
  })
})

test("image previews identify the runtime rotation used by the renderer", async () => {
  const app = makeApp({ rotation: "90" })
  const response = await app.request(
    "/api/devices/inky-phat/image",
  )
  expect(response.status).toBe(200)
  expect(response.headers.get("X-CastKit-Rotation")).toBe(
    "90",
  )
  expect(Buffer.from(await response.arrayBuffer())).toEqual(
    PNG,
  )
})

describe("server identity", () => {
  test("names the product and the public address a client should use", async () => {
    const app = createApp({
      config: {
        ...loadConfig({}),
        publicUrl: "https://castkit.example.test",
      },
      deviceStore: {
        getActiveView: () => "Clock",
      } as never,
      deviceDefinitionStore: createDeviceDefinitionStore({
        devices: loadConfig({}).devices,
        browserDevices: [],
        devicesFile: undefined,
      }),
      getDeviceSettings: () => ({ rotation: "0" }),
      onDeviceDefinitionsChanged: () => {},
      pushController: {
        renderDevice: async () => null,
      } as never,
      renderTokenStore: createRenderTokenStore(),
      setDeviceSetting: async () => false,
    })
    const response = await app.request("/api/identity")
    expect(await response.json()).toEqual({
      product: "castkit",
      publicUrl: "https://castkit.example.test",
    })
  })

  test("answers a null public address when none is configured", async () => {
    const response =
      await makeApp().request("/api/identity")
    expect(await response.json()).toEqual({
      product: "castkit",
      publicUrl: null,
    })
  })
})

describe("management shell", () => {
  const SHELL =
    "<!doctype html><title>CastKit management</title>"
  const ASSET = "console.log('management')"
  const distDirectory = mkdtempSync(
    join(tmpdir(), "castkit-management-dist-"),
  )

  beforeAll(() => {
    mkdirSync(join(distDirectory, "assets"))
    writeFileSync(join(distDirectory, "index.html"), SHELL)
    writeFileSync(
      join(distDirectory, "assets", "index-abc123.js"),
      ASSET,
    )
    vi.stubEnv("CASTKIT_MANAGEMENT_DIST_DIR", distDirectory)
  })

  afterAll(() => {
    vi.unstubAllEnvs()
    rmSync(distDirectory, { force: true, recursive: true })
  })

  test.each([
    "/",
    "/views",
    "/cook/6f1c1f3e-5a43-4f43-9a3e-6d6b2d1f9a10",
    "/manage/",
    "/manage/views",
    "/manage/devices/inky-phat",
  ])("the client route %s gets the shell with no-cache", async (path) => {
    const response = await makeApp().request(path)
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toMatch(
      /^text\/html/,
    )
    expect(response.headers.get("cache-control")).toBe(
      "no-cache",
    )
    expect(await response.text()).toBe(SHELL)
  })

  test("a HEAD request to a client route answers like a GET", async () => {
    const response = await makeApp().request(
      "/manage/views",
      { method: "HEAD" },
    )
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toMatch(
      /^text\/html/,
    )
  })

  test("/manage redirects to the admin's base", async () => {
    const response = await makeApp().request("/manage")
    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe(
      "/manage/",
    )
  })

  test("a built asset is served immutable from its /manage/assets/ URL", async () => {
    const response = await makeApp().request(
      "/manage/assets/index-abc123.js",
    )
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    )
    expect(await response.text()).toBe(ASSET)
  })

  // The cache bucket follows the request path, so a shell served
  // here would go out immutable and stay in a browser for a year.
  test.each([
    "/manage/assets/",
    "/manage/assets/gone",
  ])("the extensionless miss %s under the hashed prefix is a 404, not an immutable shell", async (path) => {
    const response = await makeApp().request(path)
    expect(response.status).toBe(404)
    expect(response.headers.get("cache-control")).toBeNull()
    expect(await response.text()).not.toBe(SHELL)
  })

  test.each([
    "/manage/assets/definitely-missing-abc123.js",
    "/cook/assets/definitely-missing-abc123.js",
    "/assets/definitely-missing-abc123.js",
    "/manage/favicon-missing.svg",
  ])("the missing file %s is a 404, not the shell", async (path) => {
    const response = await makeApp().request(path)
    expect(response.status).toBe(404)
    expect(response.headers.get("cache-control")).toBeNull()
    expect(await response.text()).not.toBe(SHELL)
  })

  test.each([
    "/api/definitely-missing",
    "/definitely-missing",
  ])("the server path %s is the server's 404, not the shell", async (path) => {
    const response = await makeApp().request(path)
    expect(response.status).toBe(404)
    expect(await response.text()).not.toBe(SHELL)
  })

  test.each([
    "/",
    "/views",
    "/manage/views",
    "/cook/abc",
    "/definitely-missing",
  ])("a POST to %s does not return the shell", async (path) => {
    const response = await makeApp().request(path, {
      method: "POST",
    })
    expect(response.status).toBe(404)
    expect(await response.text()).not.toBe(SHELL)
  })

  test("a missing API route under /api/manage stays out of the shell", async () => {
    const response = await makeApp().request(
      "/api/manage/definitely-missing",
    )
    expect(response.status).toBe(404)
    expect(await response.text()).not.toBe(SHELL)
  })
})
