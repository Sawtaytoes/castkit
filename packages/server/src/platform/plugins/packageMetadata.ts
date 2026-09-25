import { createHash } from "node:crypto"
import type { RuntimePluginPackageFormat } from "@castkit/sdk/package"
import type {
  CastKitPlugin,
  PluginManifest,
} from "@castkit/sdk/plugin"
import { validatePluginManifest } from "../platformCatalog.ts"
import {
  isPackagePath,
  PACKAGE_LIMITS,
} from "./packageArchive.ts"

/** Public metadata for an inspected package; inspection never executes its code. */
export type PluginPackageInspection = {
  inspectionId: string
  name: string
  version: string
  integrity: string
  installationId: string
  pluginId: string
  manifest: PluginManifest
  source: "registry" | "upload"
  description?: string
  license?: string
}
/** One active package version persisted by the runtime installer. */
export type InstalledPluginPackage = Omit<
  PluginPackageInspection,
  "inspectionId"
> & {
  installedAt: string
}
/** Validated package contents kept private to the installation engine. */
export type PackageContents = {
  name: string
  version: string
  format: RuntimePluginPackageFormat
  manifest: PluginManifest
  description?: string
  license?: string
}
/** Limit inputs to package names; URLs, git repositories, and filesystem specifiers are not packages. */
export const isPackageName = (
  value: unknown,
): value is string =>
  typeof value === "string" &&
  value.length <= 214 &&
  /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(
    value,
  )
/** Registry lookup resolves latest to one exact semantic version before inspection. */
export const isPackageVersion = (
  value: unknown,
): value is string =>
  typeof value === "string" &&
  value.length <= 100 &&
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
    value,
  )
const object = (value: unknown): Record<string, unknown> =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
const parseJson = (bytes: Buffer | undefined) => {
  if (!bytes || bytes.length > PACKAGE_LIMITS.metadataBytes)
    throw new Error(
      "Package JSON is missing or exceeds the metadata limit.",
    )
  return object(JSON.parse(bytes.toString("utf8")))
}
/** Versioned assets use the immutable package digest, so an update remounts browser renderers. */
export const packageInstallationId = ({
  name,
  version,
  integrity,
}: {
  name: string
  version: string
  integrity: string
}) =>
  createHash("sha256")
    .update(`${name}\0${version}\0${integrity}`)
    .digest("hex")
    .slice(0, 32)
/** Rewrite only declared renderer entry points to installed same-origin assets. */
export const installedManifest = ({
  manifest,
  installationId,
}: {
  manifest: PluginManifest
  installationId: string
}): PluginManifest => ({
  ...manifest,
  viewSpecs: manifest.viewSpecs.map((spec) => ({
    ...spec,
    ...(spec.browserEntry
      ? {
          browserEntry: `/api/plugins/assets/${installationId}/${spec.browserEntry}`,
        }
      : {}),
  })),
})
/** Check declarative metadata and public-file separation before importing a server bundle. */
export const readPackageContents = (
  files: Map<string, Buffer>,
): PackageContents => {
  const packageJson = parseJson(files.get("package.json"))
  const format = object(packageJson.castkit)
  if (
    !isPackageName(packageJson.name) ||
    !isPackageVersion(packageJson.version)
  )
    throw new Error(
      "The package must declare a valid name and exact version.",
    )
  if (
    packageJson.type !== "module" ||
    format.apiVersion !== 1 ||
    !isPackagePath(format.manifest) ||
    !isPackagePath(format.server) ||
    !/\.(mjs|js)$/.test(format.server)
  )
    throw new Error(
      "This package is not a prebundled CastKit runtime plugin.",
    )
  if (!files.has(format.server))
    throw new Error("The plugin server bundle is missing.")
  const manifest = parseJson(
    files.get(format.manifest),
  ) as unknown as PluginManifest
  if (
    manifest.version !== packageJson.version ||
    !Array.isArray(manifest.viewSpecs)
  )
    throw new Error(
      "The package and plugin manifest versions must match.",
    )
  const browserEntries = manifest.viewSpecs.flatMap(
    (spec) =>
      spec.browserEntry ? [spec.browserEntry] : [],
  )
  const publicDirectory = format.publicDirectory
  if (
    (publicDirectory !== undefined &&
      !isPackagePath(publicDirectory)) ||
    (browserEntries.length &&
      !isPackagePath(publicDirectory))
  )
    throw new Error(
      "Browser plugins must declare a safe publicDirectory.",
    )
  if (typeof publicDirectory === "string") {
    const prefix = `${publicDirectory}/`
    if (
      [format.server, format.manifest, "package.json"].some(
        (path) => path.startsWith(prefix),
      ) ||
      files.has(publicDirectory)
    )
      throw new Error(
        "The public directory must not contain private plugin metadata or server code.",
      )
    browserEntries.forEach((entry) => {
      if (
        !isPackagePath(entry) ||
        !entry.startsWith(prefix) ||
        !/\.(mjs|js)$/.test(entry) ||
        !files.has(entry)
      )
        throw new Error(
          "Every browser entry must be a prebuilt file inside publicDirectory.",
        )
    })
  }
  if (manifest.viewSpecs.some((spec) => spec.imageEntry))
    throw new Error(
      "Runtime packages must use browser capture for image rendering.",
    )
  validatePluginManifest(
    installedManifest({
      manifest,
      installationId: "0".repeat(32),
    }),
  )
  return {
    name: packageJson.name,
    version: packageJson.version,
    format: {
      apiVersion: 1,
      manifest: format.manifest,
      server: format.server,
      ...(typeof publicDirectory === "string"
        ? { publicDirectory }
        : {}),
    },
    manifest,
    ...(typeof packageJson.description === "string"
      ? {
          description: packageJson.description.slice(
            0,
            2000,
          ),
        }
      : {}),
    ...(typeof packageJson.license === "string"
      ? { license: packageJson.license.slice(0, 200) }
      : {}),
  }
}
const comparable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(comparable)
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([first], [second]) =>
          first.localeCompare(second),
        )
        .map(([key, entry]) => [key, comparable(entry)]),
    )
  return value
}
/** The executable export must implement exactly the manifest approved during inspection. */
export const readRuntimePlugin = ({
  module,
  manifest,
  installationId,
}: {
  module: unknown
  manifest: PluginManifest
  installationId: string
}): CastKitPlugin => {
  const exports = object(module)
  const plugin = object(
    exports.default ?? exports.castkitPlugin,
  )
  if (
    JSON.stringify(comparable(plugin.manifest)) !==
    JSON.stringify(comparable(manifest))
  )
    throw new Error(
      "The plugin server export does not match the inspected manifest.",
    )
  if (
    Object.values(object(plugin.adapters)).some(
      (factory) => typeof factory !== "function",
    ) ||
    Object.values(object(plugin.contracts)).some(
      (contract) =>
        typeof object(contract).parse !== "function",
    )
  )
    throw new Error(
      "The plugin has invalid adapter factories or contract parsers.",
    )
  const declared = new Set(
    manifest.adapters.map((adapter) => adapter.id),
  )
  if (
    Object.keys(object(plugin.adapters)).some(
      (id) => !declared.has(id),
    ) ||
    Array.from(declared).some(
      (id) =>
        typeof object(plugin.adapters)[id] !== "function",
    )
  )
    throw new Error(
      "Plugin adapter factories must match the manifest.",
    )
  return {
    ...plugin,
    manifest: installedManifest({
      manifest,
      installationId,
    }),
  } as CastKitPlugin
}
