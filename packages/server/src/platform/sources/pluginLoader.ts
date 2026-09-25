import type { CastKitPlugin } from "@castkit/sdk/plugin"
import { validatePluginManifest } from "../platformCatalog.ts"
import { record } from "./http.ts"

/** Only explicit npm package names are accepted by the trusted deployment manifest. */
export const parsePluginPackages = (
  configuration: unknown,
) => {
  const packages = record(configuration).packages
  if (
    !Array.isArray(packages) ||
    packages.some(
      (value) =>
        typeof value !== "string" ||
        !/^(@[a-z0-9-]+\/)?[a-z0-9][a-z0-9._-]*$/.test(
          value,
        ),
    )
  ) {
    throw new Error(
      "Plugin packages must be installed npm package names.",
    )
  }
  if (new Set(packages).size !== packages.length) {
    throw new Error("A plugin package is listed twice.")
  }
  return packages as string[]
}
/** Read a statically bundled module export; never import a URL supplied over HTTP. */
export const readInstalledPlugin = (module: unknown) => {
  const exports = record(module)
  const plugin = record(
    exports.default ?? exports.castkitPlugin,
  )
  if (!plugin.manifest) {
    throw new Error(
      "A plugin must export default or castkitPlugin.",
    )
  }
  validatePluginManifest(
    plugin.manifest as CastKitPlugin["manifest"],
  )
  const adapterFactories = record(plugin.adapters)
  if (
    Object.values(adapterFactories).some(
      (factory) => typeof factory !== "function",
    )
  ) {
    throw new Error(
      "Plugin adapter factories must be functions.",
    )
  }
  const contracts = record(plugin.contracts)
  if (
    Object.values(contracts).some(
      (contract) =>
        typeof record(contract).parse !== "function",
    )
  ) {
    throw new Error(
      "Plugin contracts must expose parse(data).",
    )
  }
  return plugin as CastKitPlugin
}
