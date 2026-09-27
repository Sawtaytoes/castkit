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
test("a source stream stays open after its connection deadline", async () => {
  vi.useFakeTimers()
  try {
    let requestSignal: AbortSignal | undefined
    const context = sourceContext({
      fetch: vi
        .fn<typeof fetch>()
        .mockImplementation(async (_url, init) => {
          requestSignal = init?.signal ?? undefined
          return new Response("frame", {
            headers: {
              "content-type":
                "multipart/x-mixed-replace; boundary=frame",
            },
          })
        }),
    })
    const response = await sourceRequest({
      context,
      path: "/camera/stream",
      timeoutMilliseconds: 20000,
      isStream: true,
    })
    await vi.advanceTimersByTimeAsync(25000)
    expect(requestSignal?.aborted).toBe(false)
    expect(await response.text()).toBe("frame")
  } finally {
    vi.useRealTimers()
  }
})
