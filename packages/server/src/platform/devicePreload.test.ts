import type { ViewDefinition } from "@castkit/sdk/contracts"
import { Hono } from "hono"
import { expect, onTestFinished, test, vi } from "vitest"
import { parseDeviceDefinition } from "../config/env.ts"
import { createPlatform } from "./platform.ts"
import { attachPlatformRoutes } from "./platformRoutes.ts"

test("configured device views prepare with their properties, remain read-only, and retain access restrictions", async () => {
  const device = parseDeviceDefinition({
    renderer: "browser",
    id: "panel",
    label: "Test panel",
    mac: "00:11:22:33:44:55",
    width: 1024,
    height: 600,
    externalViews: [
      {
        name: "Ready view",
        url: "http://display.test/view/ready",
      },
      {
        name: "Private view",
        url: "http://display.test/view/private",
      },
    ],
  })
  if (!("renderer" in device))
    throw new Error("Expected browser device")
  const platform = await createPlatform({
    publicUrl: "http://display.test",
    browserDevices: [device],
    publisher: {
      isEnabled: false,
      publish: vi.fn(async () => undefined),
      subscribe: vi.fn(async () => undefined),
      close: async () => undefined,
    },
  })
  onTestFinished(() => platform.dispose())
  const view: ViewDefinition = {
    id: "ready",
    name: "Ready view",
    layout: "single",
    theme: "dark",
    access: "public",
    isControlEnabled: true,
    panels: [
      {
        id: "text",
        specId: "text",
        bindings: {},
        settings: { content: "Prepared" },
      },
    ],
  }
  platform.store.update((state) => ({
    ...state,
    views: [
      view,
      { ...view, id: "private", access: "pin" },
      { ...view, id: "unassigned" },
    ],
  }))
  const app = new Hono()
  attachPlatformRoutes({ app, platform })
  expect(
    (
      await app.request(
        "/api/display/view/ready?device=panel",
      )
    ).status,
  ).toBe(409)
  const prepared = await app.request(
    "/api/display/view/ready?device=panel&preload=1",
  )
  expect(prepared.status).toBe(200)
  expect(await prepared.json()).toMatchObject({
    displayProperties: { width: 1024, height: 600 },
    canControl: false,
    view: { id: "ready" },
  })
  expect(
    (
      await app.request(
        "/api/display/view/ready/actions?device=panel&preload=1",
        {
          method: "POST",
          body: "{}",
          headers: { "Content-Type": "application/json" },
        },
      )
    ).status,
  ).toBe(403)
  expect(
    (
      await app.request(
        "/api/display/view/private?device=panel&preload=1",
      )
    ).status,
  ).toBe(401)
  expect(
    (
      await app.request(
        "/api/display/view/unassigned?device=panel&preload=1",
      )
    ).status,
  ).toBe(409)
  expect(
    (
      await app.request(
        "/api/display/view/ready?device=unknown&preload=1",
      )
    ).status,
  ).toBe(409)
})
