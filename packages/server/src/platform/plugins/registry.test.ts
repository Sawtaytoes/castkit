import { expect, test, vi } from "vitest"
import {
  fetchPackageBytes,
  inspectRegistryVersion,
} from "./registry.ts"

test("registry archives cannot redirect installation to another origin", async () => {
  const fetchRequest = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({
        name: "@example/plugin",
        version: "1.0.0",
        dist: {
          integrity: "sha512-placeholder",
          tarball: "https://unapproved.example/plugin.tgz",
        },
      }),
    )
  await expect(
    inspectRegistryVersion({
      name: "@example/plugin",
      registryUrl: "https://registry.example",
      fetch: fetchRequest,
    }),
  ).rejects.toThrow("configured registry origin")
  expect(fetchRequest).toHaveBeenCalledTimes(1)
})
test("chunked registry responses obey the same size budget as declared lengths", async () => {
  const fetchRequest = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2, 3]))
            controller.enqueue(new Uint8Array([4, 5, 6]))
            controller.close()
          },
        }),
      ),
    )
  await expect(
    fetchPackageBytes({
      url: "https://registry.example/package",
      fetch: fetchRequest,
      limit: 4,
    }),
  ).rejects.toThrow("size limit")
})
