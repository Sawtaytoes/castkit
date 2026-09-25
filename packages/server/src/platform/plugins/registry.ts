import { PACKAGE_LIMITS } from "./packageArchive.ts"
import {
  isPackageName,
  isPackageVersion,
} from "./packageMetadata.ts"

/** Read a network response within a fixed budget, including bodies without content-length. */
export const fetchPackageBytes = async ({
  url,
  fetch: fetchRequest,
  limit,
}: {
  url: string
  fetch: typeof fetch
  limit: number
}) => {
  const response = await fetchRequest(url, {
    redirect: "error",
    signal: AbortSignal.timeout(
      PACKAGE_LIMITS.requestMilliseconds,
    ),
    headers: {
      Accept: "application/json, application/octet-stream",
      "User-Agent": "CastKit-plugin-installer",
    },
  })
  if (!response.ok)
    throw new Error(
      `The package registry returned HTTP ${response.status}.`,
    )
  if (
    Number(response.headers.get("content-length")) > limit
  ) {
    await response.body?.cancel()
    throw new Error(
      "The package response exceeds its size limit.",
    )
  }
  if (!response.body)
    throw new Error(
      "The package registry returned an empty response.",
    )
  const reader = response.body.getReader()
  const state = { chunks: [] as Uint8Array[], size: 0 }
  const readNext = async (): Promise<void> => {
    const chunk = await reader.read()
    if (chunk.done) return
    state.size += chunk.value.byteLength
    if (state.size > limit)
      throw new Error(
        "The package response exceeds its size limit.",
      )
    state.chunks = state.chunks.concat(chunk.value)
    await readNext()
  }
  try {
    await readNext()
    return Buffer.concat(state.chunks, state.size)
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
/** Resolve npm metadata once; archive downloads stay on the explicitly configured registry origin. */
export const inspectRegistryVersion = async ({
  name,
  version = "latest",
  registryUrl,
  fetch: fetchRequest,
}: {
  name: string
  version?: string
  registryUrl: string
  fetch: typeof fetch
}) => {
  if (
    !isPackageName(name) ||
    (version !== "latest" && !isPackageVersion(version))
  )
    throw new Error(
      "Enter an npm package name and exact version, or latest.",
    )
  const registry = new URL(registryUrl)
  if (
    registry.username ||
    registry.password ||
    (registry.protocol !== "https:" &&
      !(
        registry.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(
          registry.hostname,
        )
      ))
  )
    throw new Error("The package registry must use HTTPS.")
  registry.pathname = `${registry.pathname.replace(/\/$/, "")}/${encodeURIComponent(name)}/${encodeURIComponent(version)}`
  registry.search = ""
  registry.hash = ""
  const metadata = JSON.parse(
    (
      await fetchPackageBytes({
        url: registry.toString(),
        fetch: fetchRequest,
        limit: PACKAGE_LIMITS.metadataBytes,
      })
    ).toString("utf8"),
  ) as {
    name?: unknown
    version?: unknown
    dist?: { integrity?: unknown; tarball?: unknown }
  }
  if (
    metadata.name !== name ||
    !isPackageVersion(metadata.version) ||
    (version !== "latest" &&
      metadata.version !== version) ||
    typeof metadata.dist?.integrity !== "string" ||
    typeof metadata.dist.tarball !== "string"
  )
    throw new Error(
      "The registry metadata does not pin this package version and integrity.",
    )
  const tarball = new URL(metadata.dist.tarball)
  if (
    tarball.origin !== registry.origin ||
    tarball.username ||
    tarball.password
  )
    throw new Error(
      "The package archive must come from the configured registry origin.",
    )
  return {
    name,
    version: metadata.version,
    integrity: metadata.dist.integrity,
    tarball: tarball.toString(),
  }
}
