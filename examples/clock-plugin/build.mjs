import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import plugin from "./index.js"

const root = dirname(fileURLToPath(import.meta.url))
const manifest = {
  ...plugin.manifest,
  viewSpecs: plugin.manifest.viewSpecs.map((spec) => ({
    ...spec,
    browserEntry: "dist/browser/clock.js",
  })),
}
await mkdir(join(root, "dist/browser"), { recursive: true })
await writeFile(
  join(root, "castkit.manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
)
await Promise.all([
  build({
    stdin: {
      contents: `import plugin from './index.js'; export default {...plugin,manifest:${JSON.stringify(manifest)}}`,
      resolveDir: root,
      sourcefile: "runtime-server.js",
    },
    outfile: join(root, "dist/server.js"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
  }),
  build({
    entryPoints: [join(root, "browser.js")],
    outfile: join(root, "dist/browser/clock.js"),
    bundle: true,
    platform: "browser",
    format: "esm",
    target: "es2020",
  }),
])
console.log(
  "Built the example runtime plugin and its inspectable manifest.",
)
