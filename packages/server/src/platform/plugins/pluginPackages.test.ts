import { createHash } from "node:crypto"
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, test, vi } from "vitest"
import { createPluginArchive } from "./__fixtures__/packageArchive.ts"
import { createPluginPackageManager } from "./pluginPackages.ts"

const directories = new Set<string>()
afterEach(async () => {
  await Promise.all(
    Array.from(directories, (directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  )
  directories.clear()
})
const fixture = async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "castkit-plugin-"),
  )
  directories.add(directory)
  return {
    directory,
    manager: createPluginPackageManager({ directory }),
  }
}
test("upload inspection, installation, assets, restart and removal use the same package", async () => {
  const { directory, manager } = await fixture()
  const inspection = await manager.inspectArchive({
    bytes: createPluginArchive({
      packageJson: { scripts: { install: "exit 1" } },
    }),
  })
  expect(inspection).toMatchObject({
    name: "@example/runtime-plugin",
    version: "1.0.0",
    source: "upload",
    license: "MIT",
  })
  expect(manager.list()).toEqual([])
  const validate = vi.fn()
  const installed = await manager.install({
    inspectionId: inspection.inspectionId,
    validate,
  })
  expect(validate).toHaveBeenCalledTimes(1)
  expect(
    installed.plugin.manifest.viewSpecs[0]?.browserEntry,
  ).toBe(
    `/api/plugins/assets/${installed.record.installationId}/dist/browser/view.js`,
  )
  expect(
    (
      await manager.readAsset({
        installationId: installed.record.installationId,
        path: "dist/browser/view.js",
      })
    ).contentType,
  ).toContain("text/javascript")
  await expect(
    manager.readAsset({
      installationId: installed.record.installationId,
      path: "dist/server.js",
    }),
  ).rejects.toThrow("Unknown plugin asset")
  await expect(
    manager.readAsset({
      installationId: installed.record.installationId,
      path: "package.json",
    }),
  ).rejects.toThrow("Unknown plugin asset")
  const restarted = createPluginPackageManager({
    directory,
  })
  const loaded = await restarted.load()
  expect(loaded.errors).toEqual([])
  expect(loaded.plugins[0]?.manifest.id).toBe(
    "example.runtime",
  )
  await restarted.remove({ pluginId: "example.runtime" })
  expect(restarted.list()).toEqual([])
  await expect(
    restarted.readAsset({
      installationId: installed.record.installationId,
      path: "dist/browser/view.js",
    }),
  ).rejects.toThrow("Unknown plugin asset")
})
test("inspection never imports server code and a mismatched export cannot replace the current version", async () => {
  const { manager } = await fixture()
  const initial = await manager.inspectArchive({
    bytes: createPluginArchive(),
  })
  await manager.install({
    inspectionId: initial.inspectionId,
  })
  const bad = await manager.inspectArchive({
    bytes: createPluginArchive({
      version: "2.0.0",
      files: {
        "dist/server.js":
          "throw new Error('server-import-marker')",
      },
    }),
  })
  expect(bad.version).toBe("2.0.0")
  await expect(
    manager.install({ inspectionId: bad.inspectionId }),
  ).rejects.toThrow("server-import-marker")
  expect(manager.list()[0]?.version).toBe("1.0.0")
  const mismatch = await manager.inspectArchive({
    bytes: createPluginArchive({
      version: "2.1.0",
      files: {
        "dist/server.js":
          "export default {manifest:{id:'different'}}",
      },
    }),
  })
  await expect(
    manager.install({
      inspectionId: mismatch.inspectionId,
    }),
  ).rejects.toThrow("does not match")
  expect(manager.list()[0]?.version).toBe("1.0.0")
})
test("validation rejects incompatible updates before the active package index changes", async () => {
  const { directory, manager } = await fixture()
  const first = await manager.inspectArchive({
    bytes: createPluginArchive(),
  })
  await manager.install({
    inspectionId: first.inspectionId,
  })
  const before = await readFile(
    join(directory, "installed.json"),
    "utf8",
  )
  const second = await manager.inspectArchive({
    bytes: createPluginArchive({ version: "1.1.0" }),
  })
  await expect(
    manager.install({
      inspectionId: second.inspectionId,
      validate: () => {
        throw new Error(
          "A saved view requires the previous input",
        )
      },
    }),
  ).rejects.toThrow("saved view")
  expect(
    await readFile(
      join(directory, "installed.json"),
      "utf8",
    ),
  ).toBe(before)
  const updated = await manager.install({
    inspectionId: second.inspectionId,
  })
  expect(updated.record.installationId).not.toBe(
    first.installationId,
  )
  expect(manager.list()).toHaveLength(1)
  expect(manager.list()[0]?.version).toBe("1.1.0")
})
test("registry inspection pins version and strong integrity before installation", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "castkit-registry-"),
  )
  directories.add(directory)
  const archive = createPluginArchive()
  const integrity = `sha512-${createHash("sha512").update(archive).digest("base64")}`
  const fetchRequest = vi
    .fn<typeof fetch>()
    .mockImplementation(async (url) =>
      String(url).endsWith(".tgz")
        ? new Response(archive)
        : Response.json({
            name: "@example/runtime-plugin",
            version: "1.0.0",
            dist: {
              integrity,
              tarball:
                "https://registry.example/plugin.tgz",
            },
          }),
    )
  const manager = createPluginPackageManager({
    directory,
    registryUrl: "https://registry.example",
    fetch: fetchRequest,
  })
  const inspected = await manager.inspect({
    name: "@example/runtime-plugin",
  })
  expect(inspected.integrity).toBe(integrity)
  expect(inspected.version).toBe("1.0.0")
  await manager.install({
    inspectionId: inspected.inspectionId,
  })
  expect(fetchRequest).toHaveBeenCalledTimes(2)
  expect(fetchRequest.mock.calls[0]?.[0]).toBe(
    "https://registry.example/%40example%2Fruntime-plugin/latest",
  )
  expect(fetchRequest.mock.calls[1]?.[1]?.redirect).toBe(
    "error",
  )
})
test("corrupted files and a damaged index report load errors without crashing the application", async () => {
  const { directory, manager } = await fixture()
  const inspected = await manager.inspectArchive({
    bytes: createPluginArchive(),
  })
  const installed = await manager.install({
    inspectionId: inspected.inspectionId,
  })
  await writeFile(
    join(
      directory,
      "packages",
      installed.record.installationId,
      "dist/server.js",
    ),
    "throw new Error('tampered')",
  )
  const loaded = await createPluginPackageManager({
    directory,
  }).load()
  expect(loaded.plugins).toHaveLength(0)
  expect(loaded.errors).toHaveLength(1)
  await writeFile(
    join(directory, "installed.json"),
    "incomplete",
  )
  const broken = createPluginPackageManager({ directory })
  expect((await broken.load()).errors).toHaveLength(1)
  const next = await broken.inspectArchive({
    bytes: createPluginArchive({ version: "1.1.0" }),
  })
  await expect(
    broken.install({ inspectionId: next.inspectionId }),
  ).rejects.toThrow("index")
})
test("public files cannot include the package manifest or server entry", async () => {
  const { manager } = await fixture()
  await expect(
    manager.inspectArchive({
      bytes: createPluginArchive({
        packageJson: {
          castkit: {
            apiVersion: 1,
            manifest: "castkit.manifest.json",
            server: "dist/server.js",
            publicDirectory: "dist",
          },
        },
      }),
    }),
  ).rejects.toThrow(
    "private plugin metadata or server code",
  )
})

test("the example packed by Yarn 4 installs without a dependency or build step", async () => {
  const { directory, manager } = await fixture()
  const archive = await readFile(
    new URL(
      "./__fixtures__/yarn-example.tgz",
      import.meta.url,
    ),
  )
  const inspection = await manager.inspectArchive({
    bytes: archive,
  })
  expect(inspection).toMatchObject({
    name: "@castkit/example-clock-plugin",
    version: "0.1.0",
    pluginId: "example.clock",
  })
  const installed = await manager.install({
    inspectionId: inspection.inspectionId,
  })
  expect(installed.plugin.manifest.viewSpecs[0]?.id).toBe(
    "example-clock",
  )
  expect(
    (
      await manager.readAsset({
        installationId: installed.record.installationId,
        path: "dist/browser/clock.js",
      })
    ).bytes.toString(),
  ).toContain("Custom clock")
  expect(
    (await createPluginPackageManager({ directory }).load())
      .plugins,
  ).toHaveLength(1)
})

test("package and plugin identities cannot be reassigned during installation", async () => {
  const { manager } = await fixture()
  const first = await manager.inspectArchive({
    bytes: createPluginArchive(),
  })
  await manager.install({
    inspectionId: first.inspectionId,
  })
  const duplicate = await manager.inspectArchive({
    bytes: createPluginArchive({
      packageJson: { name: "@other/runtime-plugin" },
    }),
  })
  await expect(
    manager.install({
      inspectionId: duplicate.inspectionId,
    }),
  ).rejects.toThrow("another installed package")
  const drift = await manager.inspectArchive({
    bytes: createPluginArchive({
      version: "2.0.0",
      manifest: {
        id: "example.changed",
        name: "Changed",
        version: "2.0.0",
        apiVersion: 1,
        adapters: [],
        viewSpecs: [],
      },
    }),
  })
  await expect(
    manager.install({ inspectionId: drift.inspectionId }),
  ).rejects.toThrow("cannot change its plugin ID")
  expect(manager.list()[0]?.pluginId).toBe(
    "example.runtime",
  )
})
