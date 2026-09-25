/** Portable package.json metadata for a prebundled, runtime-installable npm plugin. */
export type RuntimePluginPackageFormat = {
  apiVersion: 1
  manifest: string
  server: string
  publicDirectory?: string
}
