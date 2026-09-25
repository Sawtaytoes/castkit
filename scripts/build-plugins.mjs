import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"

const configuration = JSON.parse(
  readFileSync("castkit.plugins.json", "utf8"),
)
if (
  !Array.isArray(configuration.packages) ||
  configuration.packages.some(
    (name) =>
      typeof name !== "string" ||
      !/^(@[a-z0-9-]+\/)?[a-z0-9][a-z0-9._-]*$/.test(name),
  ) ||
  new Set(configuration.packages).size !==
    configuration.packages.length
)
  throw new Error(
    "castkit.plugins.json must list unique installed npm package names",
  )
const output = resolve(
  "packages/server/dist/slatecast/assets/plugins",
)
rmSync(output, { recursive: true, force: true })
mkdirSync(output, { recursive: true })
const modules = await Promise.all(
  configuration.packages.map(async (name, index) => {
    const imported = await import(name)
    const plugin =
      imported.default ?? imported.castkitPlugin
    if (
      plugin.manifest?.apiVersion !== 1 ||
      !/^[a-z0-9][a-z0-9._-]*$/.test(plugin.manifest.id)
    )
      throw new Error(`Invalid CastKit plugin: ${name}`)
    const entries = await Promise.all(
      plugin.manifest.viewSpecs.map(async (spec) => {
        if (!/^[a-z0-9][a-z0-9._-]*$/.test(spec.id))
          throw new Error(
            `Invalid view identifier: ${spec.id}`,
          )
        if (!spec.browserEntry) return [spec.id, null]
        if (
          !spec.browserEntry.startsWith(`${name}/`) &&
          spec.browserEntry !== name
        )
          throw new Error(
            `Renderer ${spec.id} must be an export of ${name}`,
          )
        const asset = `${plugin.manifest.id}/${spec.id}.js`
        await build({
          entryPoints: [
            fileURLToPath(
              import.meta.resolve(spec.browserEntry),
            ),
          ],
          outfile: resolve(output, asset),
          bundle: true,
          platform: "browser",
          format: "esm",
          target: "es2020",
          minify: true,
          sourcemap: true,
        })
        return [spec.id, `/assets/plugins/${asset}`]
      }),
    )
    return {
      name,
      index,
      entries: Object.fromEntries(entries),
    }
  }),
)
const source = `import type { CastKitPlugin } from "@castkit/sdk/plugin"\n${modules.map(({ name, index }) => `import * as pluginModule${index} from ${JSON.stringify(name)}`).join("\n")}\n\n/** Generated from the trusted deployment manifest. */\nexport const installedPlugins: CastKitPlugin[] = [${modules.map(({ index, entries }) => `(() => { const exported = pluginModule${index} as unknown as {default?: CastKitPlugin; castkitPlugin?: CastKitPlugin}; const plugin = (exported.default ?? exported.castkitPlugin)!; const entries: Record<string,string|null> = ${JSON.stringify(entries)}; return {...plugin, manifest: {...plugin.manifest, viewSpecs: plugin.manifest.viewSpecs.map(spec => ({...spec, browserEntry: entries[spec.id] ?? undefined}))}} })()`).join(",\n")}]\n`
writeFileSync(
  "packages/server/src/platform/installedPlugins.generated.ts",
  source,
)
console.log(
  `[plugins] Prepared ${modules.length} installed packages`,
)
