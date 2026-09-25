import { createHash, timingSafeEqual } from "node:crypto"
import { promisify } from "node:util"
import { gunzip } from "node:zlib"

/** Installation budgets apply before decompression or filesystem writes. */
export const PACKAGE_LIMITS = {
  metadataBytes: 2 * 1024 * 1024,
  archiveBytes: 20 * 1024 * 1024,
  unpackedBytes: 64 * 1024 * 1024,
  fileBytes: 16 * 1024 * 1024,
  files: 2000,
  requestMilliseconds: 30000,
} as const
const decompress = promisify(gunzip)
/** A package path is relative, unambiguous, and portable between URL and filesystem. */
export const isPackagePath = (
  value: unknown,
): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 512 &&
  value
    .split("/")
    .every((segment) =>
      /^[a-zA-Z0-9_][a-zA-Z0-9._-]*$/.test(segment),
    )
/** Verify a strong npm SRI digest before interpreting any archive bytes. */
export const verifyPackageIntegrity = ({
  archive,
  integrity,
}: {
  archive: Buffer
  integrity: string
}) => {
  const tokens = integrity.split(/\s+/)
  const algorithm = tokens.some((token) =>
    token.startsWith("sha512-"),
  )
    ? "sha512"
    : "sha256"
  const candidates = tokens.filter((token) =>
    token.startsWith(`${algorithm}-`),
  )
  const actual = createHash(algorithm)
    .update(archive)
    .digest()
  if (
    !candidates.some((token) => {
      const encoded = token.slice(algorithm.length + 1)
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
        return false
      const expected = Buffer.from(encoded, "base64")
      return (
        expected.length === actual.length &&
        timingSafeEqual(actual, expected)
      )
    })
  ) {
    throw new Error(
      "The package archive does not match its pinned integrity.",
    )
  }
}
const field = ({
  header,
  offset,
  length,
}: {
  header: Buffer
  offset: number
  length: number
}) =>
  header
    .subarray(offset, offset + length)
    .toString("utf8")
    .split("\0")[0] ?? ""
const octal = (value: string) => {
  const clean = value.replaceAll("\0", "").trim()
  if (!/^[0-7]+$/.test(clean))
    throw new Error("Invalid tar number.")
  const parsed = Number.parseInt(clean, 8)
  if (!Number.isSafeInteger(parsed))
    throw new Error(
      "Tar number exceeds the supported range.",
    )
  return parsed
}
const parsePax = (bytes: Buffer) => {
  const cursor = { offset: 0 }
  const values = new Map<string, string>()
  Array.from({ length: 100 }).some(() => {
    if (cursor.offset === bytes.length) return true
    const space = bytes.indexOf(32, cursor.offset)
    const sizeText = bytes
      .subarray(cursor.offset, space)
      .toString("ascii")
    if (space < cursor.offset || !/^\d+$/.test(sizeText))
      throw new Error("Invalid PAX record length.")
    const length = Number(sizeText)
    if (
      !Number.isSafeInteger(length) ||
      length <= space - cursor.offset + 1 ||
      cursor.offset + length > bytes.length ||
      bytes[cursor.offset + length - 1] !== 10
    )
      throw new Error("Invalid PAX record.")
    const entry = bytes
      .subarray(space + 1, cursor.offset + length - 1)
      .toString("utf8")
    const separator = entry.indexOf("=")
    if (separator < 1) throw new Error("Invalid PAX key.")
    const key = entry.slice(0, separator)
    if (key === "linkpath" || key.startsWith("GNU.sparse"))
      throw new Error(
        "Links and sparse archives are not supported.",
      )
    values.set(key, entry.slice(separator + 1))
    cursor.offset += length
    return false
  })
  if (cursor.offset !== bytes.length)
    throw new Error("Too many PAX records.")
  return values
}
/** Read npm's regular ustar/PAX files without ever extracting links or special files. */
export const readPackageArchive = async (
  archive: Buffer,
) => {
  if (archive.length > PACKAGE_LIMITS.archiveBytes)
    throw new Error("The package archive is too large.")
  const bytes = await decompress(archive, {
    maxOutputLength: PACKAGE_LIMITS.unpackedBytes,
  })
  const files = new Map<string, Buffer>()
  const seen = new Set<string>()
  const state = {
    offset: 0,
    hasEnded: false,
    pending: new Map<string, string>(),
  }
  Array.from({ length: PACKAGE_LIMITS.files * 2 + 1 }).some(
    () => {
      if (state.offset + 512 > bytes.length)
        throw new Error("The package archive is truncated.")
      const header = bytes.subarray(
        state.offset,
        state.offset + 512,
      )
      if (header.every((byte) => byte === 0)) {
        if (
          bytes.length - state.offset < 1024 ||
          bytes
            .subarray(state.offset)
            .some((byte) => byte !== 0)
        )
          throw new Error(
            "The package archive has an invalid ending.",
          )
        state.hasEnded = true
        return true
      }
      const expected = octal(
        field({ header, offset: 148, length: 8 }),
      )
      const actual = header.reduce(
        (total, byte, index) =>
          total + (index >= 148 && index < 156 ? 32 : byte),
        0,
      )
      if (actual !== expected)
        throw new Error(
          "The package tar header checksum is invalid.",
        )
      const type = field({ header, offset: 156, length: 1 })
      const headerSize = octal(
        field({ header, offset: 124, length: 12 }),
      )
      const size =
        state.pending.has("size") &&
        !["x", "g"].includes(type)
          ? Number(state.pending.get("size"))
          : headerSize
      if (
        !Number.isSafeInteger(size) ||
        size < 0 ||
        size > PACKAGE_LIMITS.fileBytes
      )
        throw new Error("A package file is too large.")
      const contentStart = state.offset + 512
      const nextOffset =
        contentStart + Math.ceil(size / 512) * 512
      if (nextOffset > bytes.length)
        throw new Error("The package archive is truncated.")
      const content = bytes.subarray(
        contentStart,
        contentStart + size,
      )
      state.offset = nextOffset
      if (["x", "g"].includes(type)) {
        const attributes = parsePax(content)
        if (type === "g") {
          if (
            attributes.has("path") ||
            attributes.has("size")
          )
            throw new Error(
              "Global PAX paths and sizes are not supported.",
            )
        } else {
          state.pending = attributes
        }
        return false
      }
      if (!["", "0", "5"].includes(type))
        throw new Error(
          "Package links and special files are not allowed.",
        )
      const prefix = field({
        header,
        offset: 345,
        length: 155,
      })
      const name = field({ header, offset: 0, length: 100 })
      const archivePath = (
        state.pending.get("path") ??
        (prefix ? `${prefix}/${name}` : name)
      ).replace(/\/$/, "")
      state.pending = new Map()
      if (type === "5" && archivePath === "package")
        return false
      if (!archivePath.startsWith("package/"))
        throw new Error(
          "Package files must be inside the package directory.",
        )
      const path = archivePath.slice(8)
      if (!isPackagePath(path))
        throw new Error(
          "The package contains an unsafe path.",
        )
      if (seen.has(path))
        throw new Error(
          "The package contains duplicate paths.",
        )
      seen.add(path)
      if (seen.size > PACKAGE_LIMITS.files)
        throw new Error(
          "The package contains too many files.",
        )
      if (type === "5") {
        if (size !== 0)
          throw new Error(
            "A package directory contains unexpected data.",
          )
        return false
      }
      files.set(path, content)
      return false
    },
  )
  if (!state.hasEnded || state.pending.size)
    throw new Error(
      "The package archive is incomplete or has too many entries.",
    )
  if (!files.has("package.json"))
    throw new Error("The archive has no package.json.")
  return files
}
