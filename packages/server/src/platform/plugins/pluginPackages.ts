import { createHash, randomUUID } from "node:crypto"
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises"
import {
  dirname,
  extname,
  join,
  resolve,
  sep,
} from "node:path"
import { pathToFileURL } from "node:url"
import type { CastKitPlugin } from "@castkit/sdk/plugin"
import {
  isPackagePath,
  PACKAGE_LIMITS,
  readPackageArchive,
  verifyPackageIntegrity,
} from "./packageArchive.ts"
import {
  type InstalledPluginPackage,
  installedManifest,
  isPackageName,
  isPackageVersion,
  type PackageContents,
  type PluginPackageInspection,
  packageInstallationId,
  readPackageContents,
  readRuntimePlugin,
} from "./packageMetadata.ts"
import {
  fetchPackageBytes,
  inspectRegistryVersion,
} from "./registry.ts"

type PackageRecord = {
  record: InstalledPluginPackage
  contents: PackageContents
  files: { path: string; digest: string; size: number }[]
}
type Inspection = {
  public: PluginPackageInspection
  contents: PackageContents
  archive: Buffer
  expiresAt: number
}
const mimeTypes: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".wasm": "application/wasm",
}
const digest = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex")
const readBounded = async (file: string) => {
  const stat = await lstat(file)
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size > PACKAGE_LIMITS.fileBytes
  )
    throw new Error(
      "An installed package file is invalid or exceeds its size limit.",
    )
  return readFile(file)
}
/** Install trusted prebundled packages without npm lifecycle scripts, dependency resolution, or an application restart. */
export const createPluginPackageManager = ({
  directory,
  registryUrl = "https://registry.npmjs.org",
  fetch: fetchRequest = fetch,
}: {
  directory: string
  registryUrl?: string
  fetch?: typeof fetch
}) => {
  const root = resolve(directory)
  const indexFile = join(root, "installed.json")
  const inspections = new Map<string, Inspection>()
  const state = {
    records: [] as PackageRecord[],
    isLoaded: false,
    indexError: "",
    pending: Promise.resolve(),
    inspectionCount: 0,
  }
  const serialize = <Result>(
    operation: () => Promise<Result>,
  ) => {
    const next = state.pending.then(operation)
    state.pending = next.then(
      () => {},
      () => {},
    )
    return next
  }
  const ensureRecords = async () => {
    if (state.isLoaded) return
    state.isLoaded = true
    try {
      const bytes = await readBounded(indexFile)
      const saved = JSON.parse(bytes.toString("utf8")) as {
        version?: unknown
        packages?: unknown
      }
      if (
        saved.version !== 1 ||
        !Array.isArray(saved.packages) ||
        saved.packages.length > 32
      )
        throw new Error("Invalid installed package index.")
      const entries = saved.packages as PackageRecord[]
      if (
        entries.some(
          (entry) =>
            !entry?.record ||
            !isPackageName(entry.record.name) ||
            !isPackageVersion(entry.record.version) ||
            !/^[a-f0-9]{32}$/.test(
              entry.record.installationId,
            ) ||
            !Array.isArray(entry.files) ||
            entry.files.length > PACKAGE_LIMITS.files ||
            entry.files.some(
              (file) =>
                !isPackagePath(file.path) ||
                !/^[a-f0-9]{64}$/.test(file.digest) ||
                !Number.isSafeInteger(file.size) ||
                file.size < 0 ||
                file.size > PACKAGE_LIMITS.fileBytes,
            ),
        )
      )
        throw new Error("Invalid installed package record.")
      if (
        new Set(entries.map((entry) => entry.record.name))
          .size !== entries.length ||
        new Set(
          entries.map((entry) => entry.record.pluginId),
        ).size !== entries.length
      )
        throw new Error(
          "Duplicate installed package identity.",
        )
      state.records = entries
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== "ENOENT"
      )
        state.indexError =
          "The installed plugin index could not be read. Existing built-in plugins remain available."
    }
  }
  const assertIndex = () => {
    if (state.indexError) throw new Error(state.indexError)
  }
  const saveRecords = async (records: PackageRecord[]) => {
    const serialized = JSON.stringify(
      { version: 1, packages: records },
      null,
      2,
    )
    if (Buffer.byteLength(serialized) > 8 * 1024 * 1024)
      throw new Error(
        "The installed plugin index exceeds its size limit.",
      )
    await mkdir(root, { recursive: true, mode: 0o700 })
    const temporary = join(
      root,
      `.index-${randomUUID()}.json`,
    )
    try {
      await writeFile(temporary, serialized, {
        mode: 0o600,
        flag: "wx",
      })
      await rename(temporary, indexFile)
    } finally {
      await rm(temporary, { force: true }).catch(() => {})
    }
    state.records = records
  }
  const packageRoot = (installationId: string) =>
    join(root, "packages", installationId)
  const readInstalledFiles = async (
    entry: PackageRecord,
  ) => {
    const directory = packageRoot(
      entry.record.installationId,
    )
    const rootStat = await lstat(directory)
    if (
      !rootStat.isDirectory() ||
      rootStat.isSymbolicLink()
    )
      throw new Error(
        "Installed package directory is invalid.",
      )
    const actualRoot = await realpath(directory)
    const results = await Promise.all(
      entry.files.map(async (file) => {
        const path = join(directory, file.path)
        const actual = await realpath(path)
        if (!actual.startsWith(`${actualRoot}${sep}`))
          throw new Error(
            "Installed package path leaves its directory.",
          )
        const bytes = await readBounded(path)
        if (
          bytes.length !== file.size ||
          digest(bytes) !== file.digest
        )
          throw new Error(
            "An installed package file changed after integrity verification.",
          )
        return [file.path, bytes] as const
      }),
    )
    return new Map(results)
  }
  const importPlugin = async (entry: PackageRecord) => {
    const files = await readInstalledFiles(entry)
    const contents = readPackageContents(files)
    if (
      contents.name !== entry.record.name ||
      contents.version !== entry.record.version ||
      contents.manifest.id !== entry.record.pluginId
    )
      throw new Error(
        "Installed package identity does not match its record.",
      )
    const timeout = {
      timer: undefined as
        | ReturnType<typeof setTimeout>
        | undefined,
    }
    const deadline = new Promise<never>(
      (_resolve, reject) => {
        timeout.timer = setTimeout(
          () =>
            reject(
              new Error(
                "The plugin server module did not finish loading within 10 seconds.",
              ),
            ),
          10000,
        )
      },
    )
    const imported = await Promise.race([
      import(
        pathToFileURL(
          join(
            packageRoot(entry.record.installationId),
            contents.format.server,
          ),
        ).href
      ),
      deadline,
    ]).finally(() => clearTimeout(timeout.timer))
    return readRuntimePlugin({
      module: imported,
      manifest: contents.manifest,
      installationId: entry.record.installationId,
    })
  }
  const pruneInspections = () => {
    Array.from(inspections.entries())
      .filter(
        ([, inspection]) =>
          inspection.expiresAt <= Date.now(),
      )
      .forEach(([id]) => {
        inspections.delete(id)
      })
    if (inspections.size >= 4)
      inspections.delete(
        inspections.keys().next().value ?? "",
      )
  }
  const remember = async ({
    archive,
    integrity,
    source,
    expected,
  }: {
    archive: Buffer
    integrity: string
    source: "registry" | "upload"
    expected?: { name: string; version: string }
  }) => {
    verifyPackageIntegrity({ archive, integrity })
    const files = await readPackageArchive(archive)
    const contents = readPackageContents(files)
    if (
      expected &&
      (contents.name !== expected.name ||
        contents.version !== expected.version)
    )
      throw new Error(
        "The downloaded package does not match the inspected registry identity.",
      )
    const installationId = packageInstallationId({
      name: contents.name,
      version: contents.version,
      integrity,
    })
    const inspectionId = randomUUID()
    const result: PluginPackageInspection = {
      inspectionId,
      name: contents.name,
      version: contents.version,
      integrity,
      installationId,
      pluginId: contents.manifest.id,
      manifest: installedManifest({
        manifest: contents.manifest,
        installationId,
      }),
      source,
      ...(contents.description
        ? { description: contents.description }
        : {}),
      ...(contents.license
        ? { license: contents.license }
        : {}),
    }
    pruneInspections()
    inspections.set(inspectionId, {
      public: result,
      contents,
      archive,
      expiresAt: Date.now() + 15 * 60000,
    })
    return structuredClone(result)
  }
  const withInspectionBudget = async <Result>(
    operation: () => Promise<Result>,
  ) => {
    if (state.inspectionCount >= 2)
      throw new Error(
        "Two plugin inspections are already in progress. Please wait.",
      )
    state.inspectionCount += 1
    try {
      return await operation()
    } finally {
      state.inspectionCount -= 1
    }
  }
  return {
    inspect: ({
      name,
      version,
    }: {
      name: string
      version?: string
    }) =>
      withInspectionBudget(async () => {
        const metadata = await inspectRegistryVersion({
          name,
          version,
          registryUrl,
          fetch: fetchRequest,
        })
        const archive = await fetchPackageBytes({
          url: metadata.tarball,
          fetch: fetchRequest,
          limit: PACKAGE_LIMITS.archiveBytes,
        })
        return remember({
          archive,
          integrity: metadata.integrity,
          source: "registry",
          expected: metadata,
        })
      }),
    inspectArchive: ({ bytes }: { bytes: Uint8Array }) =>
      withInspectionBudget(async () => {
        if (bytes.byteLength > PACKAGE_LIMITS.archiveBytes)
          throw new Error(
            "The package archive is too large.",
          )
        const archive = Buffer.from(bytes)
        const integrity = `sha512-${createHash("sha512").update(archive).digest("base64")}`
        return remember({
          archive,
          integrity,
          source: "upload",
        })
      }),
    list: () =>
      state.records.map((entry) =>
        structuredClone(entry.record),
      ),
    load: () =>
      serialize(async () => {
        await ensureRecords()
        const results = await Promise.all(
          state.records.map(async (entry) => {
            try {
              return { plugin: await importPlugin(entry) }
            } catch {
              return {
                error: {
                  name: entry.record.name,
                  pluginId: entry.record.pluginId,
                  message:
                    "The installed plugin could not load. Reinstall a compatible prebundled version.",
                },
              }
            }
          }),
        )
        return {
          records: state.records.map((entry) =>
            structuredClone(entry.record),
          ),
          plugins: results.flatMap((result) =>
            result.plugin ? [result.plugin] : [],
          ),
          errors: [
            ...(state.indexError
              ? [
                  {
                    name: "installed.json",
                    message: state.indexError,
                  },
                ]
              : []),
            ...results.flatMap((result) =>
              result.error ? [result.error] : [],
            ),
          ],
        }
      }),
    install: ({
      inspectionId,
      validate,
    }: {
      inspectionId: string
      validate?: (
        plugin: CastKitPlugin,
      ) => void | Promise<void>
    }) =>
      serialize(async () => {
        await ensureRecords()
        assertIndex()
        const inspection = inspections.get(inspectionId)
        if (
          !inspection ||
          inspection.expiresAt <= Date.now()
        )
          throw new Error(
            "This package inspection expired. Inspect it again before installation.",
          )
        const existing = state.records.find(
          (entry) =>
            entry.record.name === inspection.public.name,
        )
        if (
          existing &&
          existing.record.pluginId !==
            inspection.public.pluginId
        )
          throw new Error(
            "A package update cannot change its plugin ID.",
          )
        if (
          state.records.some(
            (entry) =>
              entry.record.pluginId ===
                inspection.public.pluginId &&
              entry.record.name !== inspection.public.name,
          )
        )
          throw new Error(
            "That plugin ID belongs to another installed package.",
          )
        if (!existing && state.records.length >= 32)
          throw new Error(
            "The installation already contains 32 runtime packages.",
          )
        verifyPackageIntegrity({
          archive: inspection.archive,
          integrity: inspection.public.integrity,
        })
        const files = await readPackageArchive(
          inspection.archive,
        )
        const { inspectionId: omitted, ...publicRecord } =
          inspection.public
        const record: InstalledPluginPackage = {
          ...publicRecord,
          installedAt: new Date().toISOString(),
        }
        const entry: PackageRecord = {
          record,
          contents: inspection.contents,
          files: Array.from(files, ([path, bytes]) => ({
            path,
            digest: digest(bytes),
            size: bytes.length,
          })),
        }
        const destination = packageRoot(
          record.installationId,
        )
        const staging = join(
          root,
          `.staging-${randomUUID()}`,
        )
        const isAlreadyActive = state.records.some(
          (item) =>
            item.record.installationId ===
            record.installationId,
        )
        try {
          if (!isAlreadyActive) {
            await mkdir(staging, {
              recursive: true,
              mode: 0o700,
            })
            await Promise.all(
              Array.from(files, async ([path, bytes]) => {
                const target = join(staging, path)
                await mkdir(dirname(target), {
                  recursive: true,
                  mode: 0o700,
                })
                await writeFile(target, bytes, {
                  flag: "wx",
                  mode: 0o600,
                })
              }),
            )
            await mkdir(dirname(destination), {
              recursive: true,
              mode: 0o700,
            })
            await rm(destination, {
              recursive: true,
              force: true,
            })
            await rename(staging, destination)
          }
          const plugin = await importPlugin(entry)
          await validate?.(plugin)
          await saveRecords(
            state.records
              .filter(
                (item) => item.record.name !== record.name,
              )
              .concat(entry),
          )
          inspections.delete(inspectionId)
          if (
            existing &&
            existing.record.installationId !==
              record.installationId
          ) {
            await rm(
              packageRoot(existing.record.installationId),
              { recursive: true, force: true },
            ).catch(() => {})
          }
          return { record: structuredClone(record), plugin }
        } catch (error) {
          if (!isAlreadyActive)
            await rm(destination, {
              recursive: true,
              force: true,
            }).catch(() => {})
          throw error
        } finally {
          await rm(staging, {
            recursive: true,
            force: true,
          }).catch(() => {})
        }
      }),
    remove: ({
      pluginId,
      validate,
    }: {
      pluginId: string
      validate?: (
        record: InstalledPluginPackage,
      ) => void | Promise<void>
    }) =>
      serialize(async () => {
        await ensureRecords()
        assertIndex()
        const entry = state.records.find(
          (item) => item.record.pluginId === pluginId,
        )
        if (!entry)
          throw new Error(
            "This plugin package is not installed.",
          )
        await validate?.(structuredClone(entry.record))
        await saveRecords(
          state.records.filter((item) => item !== entry),
        )
        await rm(packageRoot(entry.record.installationId), {
          recursive: true,
          force: true,
        }).catch(() => {})
      }),
    readAsset: async ({
      installationId,
      path,
    }: {
      installationId: string
      path: string
    }) => {
      await ensureRecords()
      if (
        !/^[a-f0-9]{32}$/.test(installationId) ||
        !isPackagePath(path)
      )
        throw new Error("Unknown plugin asset.")
      const entry = state.records.find(
        (item) =>
          item.record.installationId === installationId,
      )
      const publicDirectory =
        entry?.contents.format.publicDirectory
      const file = entry?.files.find(
        (item) => item.path === path,
      )
      const contentType =
        mimeTypes[extname(path).toLowerCase()]
      if (
        !entry ||
        !publicDirectory ||
        !path.startsWith(`${publicDirectory}/`) ||
        !file ||
        !contentType
      )
        throw new Error("Unknown plugin asset.")
      const directory = packageRoot(installationId)
      const resolved = await realpath(join(directory, path))
      if (
        !resolved.startsWith(
          `${await realpath(directory)}${sep}`,
        )
      )
        throw new Error("Unknown plugin asset.")
      const bytes = await readBounded(resolved)
      if (digest(bytes) !== file.digest)
        throw new Error(
          "The installed plugin asset failed its integrity check.",
        )
      return { bytes, contentType }
    },
  }
}
/** Runtime package manager contract used by authenticated platform routes. */
export type PluginPackageManager = ReturnType<
  typeof createPluginPackageManager
>
