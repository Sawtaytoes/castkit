import { expect, test, vi } from "vitest"
import { sourceContext } from "./__fixtures__/sourceContext.ts"
import { sourceRequest, sourceUrl } from "./http.ts"

test("source paths preserve configured origin and API subpaths", () => {
  expect(
    sourceUrl({
      baseUrl: "https://service.example/prefix/",
      path: "/api/states?limit=2",
    }),
  ).toBe(
    "https://service.example/prefix/api/states?limit=2",
  )
  expect(() =>
    sourceUrl({
      baseUrl: "https://service.example//other.example",
      path: "/api/states",
    }),
  ).toThrow("configured origin")
  expect(() =>
    sourceUrl({
      baseUrl: "https://service.example",
      path: "//other.example/api",
    }),
  ).toThrow("configured origin")
})
test("an origin escape never sends source credentials", async () => {
  const fetchRequest = vi.fn<typeof fetch>()
  const context = sourceContext({ fetch: fetchRequest })
  context.source.settings.url =
    "https://service.example//other.example"
  await expect(
    sourceRequest({
      context,
      path: "/api/states",
      headers: {
        Authorization: "Bearer example-test-credential",
      },
    }),
  ).rejects.toThrow("configured origin")
  expect(fetchRequest).not.toHaveBeenCalled()
})
