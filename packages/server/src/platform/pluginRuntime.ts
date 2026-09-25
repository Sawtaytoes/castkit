import type { CastKitPlugin } from "@castkit/sdk/plugin"
import { installedPlugins } from "./installedPlugins.generated.ts"
import { createPlatformCatalog } from "./platformCatalog.ts"
import type { PlatformStore } from "./platformStore.ts"
import { createPluginPackageManager } from "./plugins/pluginPackages.ts"

/** Own installed package lifetimes and validate replacements against saved configuration. */
export const createPluginRuntime = async ({
  file,
  manager: suppliedManager,
  store,
  onChanged,
  validateCatalog,
}: {
  file?: string
  manager?: ReturnType<typeof createPluginPackageManager>
  store: PlatformStore
  onChanged: () => Promise<void>
  validateCatalog?: (
    catalog: ReturnType<typeof createPlatformCatalog>,
  ) => void
}) => {
  const manager =
    suppliedManager ??
    (file
      ? createPluginPackageManager({
          directory: `${file}.plugins`,
        })
      : undefined)
  const plugins = new Map<string, CastKitPlugin>()
  const errors = {
    value: [] as { name: string; error: string }[],
  }
  const loaded = await manager?.load()
  errors.value = (loaded?.errors ?? []).map((item) => ({
    name: item.name,
    error: item.message,
  }))
  // Each package is isolated so one failed extension does not hide the management interface.
  loaded?.plugins.forEach((plugin) => {
    try {
      createPlatformCatalog({
        plugins: [
          ...installedPlugins,
          ...plugins.values(),
          plugin,
        ],
      })
      plugins.set(plugin.manifest.id, plugin)
    } catch (error) {
      errors.value = errors.value.concat({
        name: plugin.manifest.name,
        error:
          error instanceof Error
            ? error.message
            : "Could not load plugin",
      })
    }
  })
  const catalog = createPlatformCatalog({
    plugins: [...installedPlugins, ...plugins.values()],
  })
  const state = { isChanging: false }
  const candidates = (
    candidate?: CastKitPlugin,
    removedId?: string,
  ) => [
    ...installedPlugins,
    ...Array.from(plugins.values()).filter(
      (plugin) =>
        plugin.manifest.id !==
        (candidate?.manifest.id ?? removedId),
    ),
    ...(candidate ? [candidate] : []),
  ]
  const validate = (next: CastKitPlugin[]) => {
    const candidateCatalog = createPlatformCatalog({
      plugins: next,
    })
    store.get().sources.forEach((source) => {
      const adapter = candidateCatalog.getAdapter(
        source.adapter,
      )
      if (!adapter)
        throw new Error(
          "This plugin is used by a source. Remove that source first.",
        )
      store
        .get()
        .channels.filter(
          (channel) => channel.sourceId === source.id,
        )
        .forEach((channel) => {
          if (
            !adapter.channelTypes.includes(channel.type) ||
            !candidateCatalog.contracts.has(channel.type)
          )
            throw new Error(
              "The new plugin version does not support a configured channel.",
            )
        })
    })
    store.get().channels.forEach((channel) => {
      if (!candidateCatalog.contracts.has(channel.type))
        throw new Error("This plugin is used by a channel.")
    })
    store.get().views.forEach((view) => {
      candidateCatalog.validateView(
        view,
        store.get().channels,
      )
    })
    validateCatalog?.(candidateCatalog)
  }
  const requireManager = () => {
    if (!manager)
      throw new Error(
        "Plugin installation requires persistent CastKit storage.",
      )
    return manager
  }
  const change = async <Result>(
    operation: () => Promise<Result>,
  ) => {
    if (state.isChanging)
      throw new Error(
        "Another plugin change is in progress.",
      )
    state.isChanging = true
    try {
      return await operation()
    } finally {
      state.isChanging = false
    }
  }
  return {
    catalog,
    get isChanging() {
      return state.isChanging
    },
    get isAvailable() {
      return Boolean(manager)
    },
    list: () => manager?.list() ?? [],
    getErrors: () => structuredClone(errors.value),
    inspect: (request: {
      name: string
      version?: string
    }) => requireManager().inspect(request),
    inspectArchive: (request: { bytes: Uint8Array }) =>
      requireManager().inspectArchive(request),
    install: (inspectionId: string) =>
      change(async () => {
        const result = await requireManager().install({
          inspectionId,
          validate: (candidate) =>
            validate(candidates(candidate)),
        })
        errors.value = errors.value.filter(
          (item) =>
            item.name !== result.record.name &&
            item.name !== result.plugin.manifest.name,
        )
        plugins.set(
          result.plugin.manifest.id,
          result.plugin,
        )
        catalog.replacePlugins(candidates())
        await onChanged()
        return result.record
      }),
    remove: (pluginId: string) =>
      change(async () => {
        if (
          !plugins.has(pluginId) &&
          !manager
            ?.list()
            .some((record) => record.pluginId === pluginId)
        )
          throw new Error(
            "Only downloaded plugins can be removed.",
          )
        validate(candidates(undefined, pluginId))
        const removedName = manager
          ?.list()
          .find(
            (record) => record.pluginId === pluginId,
          )?.name
        await requireManager().remove({ pluginId })
        errors.value = errors.value.filter(
          (item) =>
            item.name !== removedName &&
            item.name !==
              plugins.get(pluginId)?.manifest.name,
        )
        plugins.delete(pluginId)
        catalog.replacePlugins(candidates())
        store.update((previous) => ({
          ...previous,
          disabledPluginIds:
            previous.disabledPluginIds.filter(
              (id) => id !== pluginId,
            ),
        }))
        await onChanged()
      }),
    readAsset: (request: {
      installationId: string
      path: string
    }) => requireManager().readAsset(request),
  }
}
/** Package lifecycle API shared by HTTP and the running catalog. */
export type PluginRuntime = Awaited<
  ReturnType<typeof createPluginRuntime>
>
