import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Hono } from "hono"
import { afterEach, expect, test, vi } from "vitest"
import { createPlatformAccess } from "./platformAccess.ts"
import { createPlatformStore } from "./platformStore.ts"

const directories = new Set<string>()
afterEach(() => {
  vi.useRealTimers()
  directories.forEach((directory) => {
    rmSync(directory, { recursive: true, force: true })
  })
  directories.clear()
})

test("management sign-in survives daily visits and store restoration until its cookie expires", async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
  const directory = mkdtempSync(
    join(tmpdir(), "castkit-access-"),
  )
  directories.add(directory)
  const file = join(directory, "platform.json")
  const store = createPlatformStore({ file })
  const access = createPlatformAccess({ store })
  const app = new Hono()
  app.post("/login", (context) => {
    access.issue({ context, isAdminSession: true })
    return context.json({ ok: true })
  })
  const response = await app.request("/login", {
    method: "POST",
  })
  const header = response.headers.get("set-cookie") ?? ""
  expect(header).toContain("Max-Age=31536000")
  expect(header).toContain("HttpOnly")
  expect(header).toContain("SameSite=Strict")
  const cookie = header.split(";")[0] ?? ""
  const restoredAccess = createPlatformAccess({
    store: createPlatformStore({ file }),
  })
  const restoredApp = new Hono()
  restoredApp.get("/session", (context) =>
    context.json({
      isAuthenticated: restoredAccess.isAdmin(context),
    }),
  )
  const session = async () =>
    (
      await restoredApp.request("/session", {
        headers: { Cookie: cookie },
      })
    ).json()
  vi.advanceTimersByTime(24 * 60 * 60 * 1000)
  expect(await session()).toEqual({ isAuthenticated: true })
  vi.advanceTimersByTime(363 * 24 * 60 * 60 * 1000)
  expect(await session()).toEqual({ isAuthenticated: true })
  vi.advanceTimersByTime(24 * 60 * 60 * 1000)
  expect(await session()).toEqual({
    isAuthenticated: false,
  })
})
