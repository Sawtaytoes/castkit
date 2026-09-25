import { createHash } from "node:crypto"
import { gunzipSync, gzipSync } from "node:zlib"
import { expect, test } from "vitest"
import {
  createPluginArchive,
  createTarArchive,
} from "./__fixtures__/packageArchive.ts"
import {
  PACKAGE_LIMITS,
  readPackageArchive,
  verifyPackageIntegrity,
} from "./packageArchive.ts"

test("archive extraction rejects traversal, links, duplicate entries and corrupt headers", async () => {
  await expect(
    readPackageArchive(
      createTarArchive([
        { path: "package/../escape", content: "bad" },
      ]),
    ),
  ).rejects.toThrow("unsafe path")
  await expect(
    readPackageArchive(
      createTarArchive([
        { path: "package/link", type: "2" },
      ]),
    ),
  ).rejects.toThrow("links and special")
  await expect(
    readPackageArchive(
      createTarArchive([
        { path: "package/a", content: "first" },
        { path: "package/a", content: "second" },
      ]),
    ),
  ).rejects.toThrow("duplicate")
  const bytes = gunzipSync(createPluginArchive())
  bytes[0] = 120
  await expect(
    readPackageArchive(gzipSync(bytes)),
  ).rejects.toThrow("checksum")
})
test("PAX paths are interpreted before validation and cannot bypass traversal checks", async () => {
  const path = "package/../escape"
  const body = `path=${path}\n`
  const length = Buffer.byteLength(body) + 3
  const pax = `${length} ${body}`
  expect(Buffer.byteLength(pax)).toBe(length)
  await expect(
    readPackageArchive(
      createTarArchive([
        { path: "PaxHeader", type: "x", content: pax },
        { path: "package/safe", content: "bad" },
      ]),
    ),
  ).rejects.toThrow("unsafe path")
})
test("integrity and decompression budgets are checked before filesystem writes", async () => {
  const archive = createPluginArchive()
  const integrity = `sha512-${createHash("sha512").update(archive).digest("base64")}`
  expect(() =>
    verifyPackageIntegrity({ archive, integrity }),
  ).not.toThrow()
  expect(() =>
    verifyPackageIntegrity({
      archive: Buffer.concat([
        archive,
        Buffer.from("changed"),
      ]),
      integrity,
    }),
  ).toThrow("integrity")
  await expect(
    readPackageArchive(
      gzipSync(
        Buffer.alloc(PACKAGE_LIMITS.unpackedBytes + 1),
      ),
    ),
  ).rejects.toThrow()
})

test("a valid PAX long filename is preserved", async () => {
  const path = `package/${"a".repeat(100)}/asset.js`
  const body = `path=${path}\n`
  const length = Buffer.byteLength(body) + 4
  const pax = `${length} ${body}`
  expect(Buffer.byteLength(pax)).toBe(length)
  const files = await readPackageArchive(
    createTarArchive([
      { path: "package/package.json", content: "{}" },
      { path: "PaxHeader", type: "x", content: pax },
      { path: "package/short", content: "asset" },
    ]),
  )
  expect(files.get(path.slice(8))?.toString()).toBe("asset")
})
