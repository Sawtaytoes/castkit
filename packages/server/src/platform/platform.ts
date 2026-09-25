import { randomBytes } from "node:crypto"
import type {
  ChannelSnapshot,
  ViewDefinition,
} from "@castkit/sdk/contracts"
import type { MqttPublisher } from "@castkit/shared/mqtt/publisher"
import type {
  BrowserDeviceConfig,
  ConfiguredDevice,
} from "../config/env.ts"
import { getRepaintForDevice } from "../views/viewsForDevice.ts"
import { createChannelHub } from "./channelHub.ts"
import { installedPlugins } from "./installedPlugins.generated.ts"
import { createPlatformAccess } from "./platformAccess.ts"
import { createPlatformCatalog } from "./platformCatalog.ts"
import { createPlatformStore } from "./platformStore.ts"
import { createScreenController } from "./screenController.ts"
import { createSourceRuntime } from "./sourceRuntime.ts"

/** Create the common runtime used by management, browser screens, and automation. */
export const createPlatform = async ({
  file,
  apiToken,
  publisher,
  publicUrl = "",
  topicPrefix = "castkit",
  discoveryPrefix = "homeassistant",
  devices = [],
  browserDevices = [],
}: {
  file?: string
  apiToken?: string
  publisher: MqttPublisher
  publicUrl?: string
  topicPrefix?: string
  discoveryPrefix?: string
  devices?: readonly ConfiguredDevice[]
  browserDevices?: readonly BrowserDeviceConfig[]
}) => {
  const store = createPlatformStore({ file })
  const catalog = createPlatformCatalog({
    plugins: installedPlugins,
  })
  const hub = createChannelHub({
    contracts: catalog.contracts,
  })
  const renderKey = randomBytes(32).toString("hex")
  const access = createPlatformAccess({
    store,
    apiToken,
    renderKey,
  })
  const screens = createScreenController({ store })
  const listeners = new Set<() => void>()
  const notify = () =>
    listeners.forEach((listener) => {
      listener()
    })
  const runtime = createSourceRuntime({
    hub,
    catalog,
    historyFile: file ? `${file}.history.json` : undefined,
    getSecrets: (sourceId: string) =>
      store.get().secrets[sourceId] ?? {},
    mqtt: publisher.isEnabled
      ? {
          subscribe: (topic: string) =>
            publisher.subscribe({
              topics: [topic],
              handler: () => {},
            }),
          publish: publisher.publish,
        }
      : undefined,
  })
  const announcedScreens = new Set<string>()
  const announceScreens = async () => {
    await Promise.all(
      Array.from(announcedScreens)
        .filter(
          (id) =>
            !store
              .get()
              .screens.some((screen) => screen.id === id),
        )
        .map(async (id) => {
          await publisher.publish({
            topic: `${discoveryPrefix}/select/castkit_screen_${id}/view/config`,
            payload: "",
            isRetained: true,
          })
          announcedScreens.delete(id)
        }),
    )
    return Promise.all(
      store.get().screens.map(async (screen) => {
        announcedScreens.add(screen.id)
        const stateTopic = `${topicPrefix}/screens/${screen.id}/view/state`
        await publisher.publish({
          topic: `${discoveryPrefix}/select/castkit_screen_${screen.id}/view/config`,
          payload: JSON.stringify({
            name: "View",
            unique_id: `castkit_screen_${screen.id}_view`,
            command_topic: `${topicPrefix}/screens/${screen.id}/view/set`,
            state_topic: stateTopic,
            options: screen.viewIds,
            device: {
              identifiers: [`castkit_screen_${screen.id}`],
              name: screen.name,
              manufacturer: "CastKit",
              model: "Browser screen",
              configuration_url: `${publicUrl}/screen/${screen.id}`,
            },
          }),
          isRetained: true,
        })
        await publisher.publish({
          topic: stateTopic,
          payload: screens.getActiveViewId(screen),
          isRetained: true,
        })
      }),
    )
  }
  const refresh = async () => {
    await runtime.configure({
      sources: store.get().sources,
      channels: store.get().channels,
    })
    notify()
    await announceScreens()
  }
  hub.subscribe(notify)
  screens.subscribe(() => {
    notify()
    void announceScreens().catch((error) =>
      console.error(
        "[platform] MQTT screen update failed",
        error,
      ),
    )
  })
  await publisher.subscribe({
    topics: [`${topicPrefix}/screens/+/view/set`],
    handler: async (message) => {
      runtime.handleMqttMessage(message)
      const prefix = `${topicPrefix}/screens/`
      if (
        !message.topic.startsWith(prefix) &&
        message.topic.startsWith(`${topicPrefix}/`) &&
        message.topic.endsWith("/view/set")
      ) {
        const deviceId = message.topic.slice(
          topicPrefix.length + 1,
          -"/view/set".length,
        )
        const screenId = store.get().deviceScreens[deviceId]
        const screen = store
          .get()
          .screens.find((item) => item.id === screenId)
        const slug = message.payload
          .toLowerCase()
          .replaceAll(" ", "-")
        const candidates = store
          .get()
          .views.filter(
            (view) =>
              screen?.viewIds.includes(view.id) &&
              (view.id === message.payload ||
                view.name === message.payload ||
                (view.panels.length === 1 &&
                  view.panels[0]?.specId === slug)),
          )
        if (screenId && candidates.length === 1)
          screens.select({
            screenId,
            viewId: candidates[0]?.id,
          })
      }
      if (
        !message.topic.startsWith(prefix) ||
        !message.topic.endsWith("/view/set")
      )
        return
      const screenId = message.topic.slice(
        prefix.length,
        -"/view/set".length,
      )
      try {
        const request = message.payload.startsWith("{")
          ? JSON.parse(message.payload)
          : { viewId: message.payload }
        screens.select({ screenId, ...request })
      } catch (error) {
        console.warn(
          "[platform] Ignored invalid screen command",
          error instanceof Error
            ? error.message
            : "invalid JSON",
        )
      }
    },
  })
  const getDeviceProperties = (deviceId: string) => {
    const device = [...devices, ...browserDevices].find(
      (item) => item.id === deviceId,
    )
    if (!device) return undefined
    const isBrowserDevice = browserDevices.some(
      (item) => item.id === deviceId,
    )
    return {
      width: device.width,
      height: device.height,
      repaint: getRepaintForDevice({
        ...device,
        isBrowserDevice,
      }),
      power:
        ("power" in device ? device.power : undefined) ??
        "wired",
      delivery: isBrowserDevice
        ? ("browser" as const)
        : ("image" as const),
      hasTouch:
        "hasTouch" in device
          ? Boolean(device.hasTouch)
          : false,
      hasViewDrawer:
        "hasViewDrawer" in device
          ? Boolean(device.hasViewDrawer)
          : false,
      colorMode:
        "colorMode" in device
          ? device.colorMode
          : device.color,
      isBrowserDevice,
    }
  }
  const getTarget = ({
    kind,
    id,
  }: {
    kind: "view" | "screen"
    id: string
  }) => {
    const screen =
      kind === "screen"
        ? store.get().screens.find((item) => item.id === id)
        : undefined
    const viewId =
      kind === "screen"
        ? screen && screens.getActiveViewId(screen)
        : id
    const view = store
      .get()
      .views.find((item) => item.id === viewId)
    return view && (kind !== "screen" || screen)
      ? { view, screen }
      : null
  }
  const channelsForView = (view: ViewDefinition) =>
    Object.fromEntries(
      Array.from(
        new Set(
          view.panels.flatMap((panel) =>
            Object.values(panel.bindings),
          ),
        ),
      ).map((channelId) => [
        channelId,
        hub.get(channelId) ?? {
          id: channelId,
          type: "unknown",
          data: null,
          status: "waiting",
        },
      ]),
    ) as Record<string, ChannelSnapshot>
  await refresh()
  return {
    getDeviceProperties,
    renderKey,
    store,
    catalog,
    hub,
    access,
    screens,
    runtime,
    getTarget,
    channelsForView,
    refresh,
    notify,
    announceScreens,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    dispose: () => {
      runtime.dispose()
      screens.dispose()
      hub.dispose()
      listeners.clear()
    },
  }
}
/** Application-facing platform runtime. */
export type Platform = Awaited<
  ReturnType<typeof createPlatform>
>
