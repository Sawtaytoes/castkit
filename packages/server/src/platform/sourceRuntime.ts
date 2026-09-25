import type {
  ChannelDefinition,
  SourceDefinition,
} from "@castkit/sdk/contracts"
import type {
  MqttTransport,
  SourceAction,
  SourceFactory,
  SourceInstance,
} from "@castkit/sdk/plugin"
import type { ChannelHub } from "./channelHub.ts"
import type { PlatformCatalog } from "./platformCatalog.ts"
import { createChannelHistory } from "./sources/channelHistory.ts"

/** Owns source lifetimes and prevents obsolete requests from publishing after edits. */
export const createSourceRuntime = ({
  hub,
  catalog,
  mqtt,
  fetch: fetchRequest = fetch,
  getSecrets = () => ({}),
  historyFile,
}: {
  hub: ChannelHub
  catalog: PlatformCatalog
  mqtt?: MqttTransport
  fetch?: typeof fetch
  historyFile?: string
  getSecrets?: (sourceId: string) => Record<string, string>
}) => {
  const history = createChannelHistory({
    ...(historyFile ? { file: historyFile } : {}),
    reportError: (message) =>
      console.warn(`[castkit] ${message}`),
  })
  const running = new Map<
    string,
    {
      instance: SourceInstance
      controller: AbortController
      fingerprint: string
      factory: SourceFactory
    }
  >()
  const channelSources = new Map<string, string>()
  const definitions = new Map<string, SourceDefinition>()
  const stop = (id: string) => {
    const existing = running.get(id)
    existing?.controller.abort()
    try {
      existing?.instance.dispose()
    } catch {
      /* A failing plugin must not prevent other sources from stopping. */
    }
    running.delete(id)
  }
  const queue = {
    pending: Promise.resolve(),
    isDisposed: false,
  }
  const applyConfiguration = async ({
    sources,
    channels,
  }: {
    sources: SourceDefinition[]
    channels: ChannelDefinition[]
  }) => {
    const ids = new Set(
      sources
        .filter((source) => source.isEnabled)
        .map((source) => source.id),
    )
    Array.from(running.keys())
      .filter((id) => !ids.has(id))
      .forEach(stop)
    definitions.clear()
    sources.forEach((source) => {
      definitions.set(source.id, source)
    })
    channelSources.clear()
    channels.forEach((channel) => {
      channelSources.set(channel.id, channel.sourceId)
    })
    hub.configure(channels)
    history.configure(channels)
    await Promise.all(
      sources
        .filter((source) => source.isEnabled)
        .map(async (source) => {
          const sourceChannels = channels.filter(
            (channel) => channel.sourceId === source.id,
          )
          const secrets = getSecrets(source.id)
          const fingerprint = JSON.stringify({
            source,
            channels: sourceChannels,
            secrets,
          })
          const factory = catalog.adapterFactories.get(
            source.adapter,
          )
          if (
            running.get(source.id)?.fingerprint ===
              fingerprint &&
            running.get(source.id)?.factory === factory
          ) {
            return
          }
          stop(source.id)
          if (!factory) {
            sourceChannels.forEach((channel) => {
              hub.setStatus({
                channelId: channel.id,
                status: "error",
                error:
                  "The source adapter is not installed.",
              })
            })
            return
          }
          const controller = new AbortController()
          try {
            const instance = factory({
              source,
              channels: sourceChannels,
              secrets,
              signal: controller.signal,
              appendHistory: history.append,
              fetch: fetchRequest,
              ...(mqtt ? { mqtt } : {}),
              publish: (request) => {
                if (!controller.signal.aborted) {
                  hub.publish(request)
                }
              },
              reportError: (request) => {
                if (!controller.signal.aborted) {
                  hub.setStatus({
                    ...request,
                    status: "error",
                  })
                }
              },
            })
            running.set(source.id, {
              instance,
              controller,
              fingerprint,
              factory,
            })
            await instance.start?.()
          } catch {
            if (controller.signal.aborted) {
              return
            }
            sourceChannels.forEach((channel) => {
              hub.setStatus({
                channelId: channel.id,
                status: "error",
                error:
                  "The source could not start. Check its connection settings.",
              })
            })
          }
        }),
    )
    channels
      .filter((channel) => !ids.has(channel.sourceId))
      .forEach((channel) => {
        hub.setStatus({
          channelId: channel.id,
          status: "waiting",
        })
      })
  }
  const configure = (configuration: {
    sources: SourceDefinition[]
    channels: ChannelDefinition[]
  }) => {
    const next = queue.pending.then(async () => {
      if (!queue.isDisposed) {
        await applyConfiguration(configuration)
      }
    })
    queue.pending = next.catch(() => undefined)
    return next
  }
  const instanceFor = (channelId: string) => {
    const sourceId = channelSources.get(channelId)
    return sourceId
      ? running.get(sourceId)?.instance
      : undefined
  }
  return {
    configure,
    handleMqttMessage: (request: {
      topic: string
      payload: string
    }) =>
      running.forEach(({ instance }) => {
        instance.handleMqttMessage?.(request)
      }),
    executeAction: async (request: SourceAction) => {
      const instance = instanceFor(request.channelId)
      if (!instance?.executeAction) {
        throw new Error(
          "This channel does not support actions.",
        )
      }
      return instance.executeAction(request)
    },
    getMedia: async (request: {
      channelId: string
      assetId: string
      kind?: string
    }) => {
      const instance = instanceFor(request.channelId)
      if (!instance?.getMedia) {
        throw new Error(
          "This channel does not supply media.",
        )
      }
      return instance.getMedia(request)
    },
    discover: async (sourceId: string) => {
      const instance = running.get(sourceId)?.instance
      if (!instance?.discover) {
        throw new Error(
          "This source does not provide discovery.",
        )
      }
      return instance.discover()
    },
    dispose: () => {
      queue.isDisposed = true
      Array.from(running.keys()).forEach(stop)
      channelSources.clear()
      definitions.clear()
      return history.dispose()
    },
  }
}
/** Source runtime interface for application integration. */
export type SourceRuntime = ReturnType<
  typeof createSourceRuntime
>
