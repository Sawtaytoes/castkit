import type { ContractData } from "@castkit/sdk/contracts"
import type { ComponentType } from "preact"
import type { HomeDashboardProps } from "./HomeDashboard.tsx"
import { warmMedia } from "./mediaCache.ts"
import {
  type DisplaySnapshot,
  safeMediaUrl,
} from "./protocol.ts"

const home: {
  View?: ComponentType<HomeDashboardProps>
  pending?: Promise<ComponentType<HomeDashboardProps>>
} = {}

/** Remount a resolved deferred dashboard without another empty effect cycle. */
export const readHomeDashboard = () => home.View ?? null

/** Share the deferred import between idle preloading and the visible dashboard. */
export const loadHomeDashboard = () => {
  home.pending ??= import("./HomeDashboard.tsx")
    .then((module) => {
      home.View = module.HomeDashboard
      return module.HomeDashboard
    })
    .catch((failure: unknown) => {
      home.pending = undefined
      throw failure
    })
  return home.pending
}

/** Prepare only static media used by this composition, never camera/video streams. */
export const warmViewAssets = async ({
  snapshot,
  signal,
}: {
  snapshot: DisplaySnapshot
  signal?: AbortSignal
}) => {
  if (
    snapshot.view.panels.some(
      (panel) =>
        typeof panel.settings.homeGroup === "string",
    )
  ) {
    await loadHomeDashboard().catch(() => undefined)
  }
  const paths = snapshot.view.panels.flatMap((panel) =>
    [
      panel.bindings.data,
      panel.specId === "idle-dashboard"
        ? panel.bindings.music
        : undefined,
    ].flatMap((channelId) => {
      const channel = snapshot.channels[channelId ?? ""]
      if (channel?.type === "now-playing.v1") {
        return [
          (channel.data as ContractData["now-playing.v1"])
            ?.artworkPath,
        ]
      }
      if (channel?.type === "music-player.v1") {
        const music = channel.data as
          | ContractData["music-player.v1"]
          | undefined
        return [
          music?.current?.artworkPath,
          ...(music?.queue?.items
            .slice(0, 3)
            .map((item) => item.artworkPath) ?? []),
        ]
      }
      if (channel?.type === "images.v1") {
        return (
          (
            channel.data as ContractData["images.v1"]
          )?.images
            .slice(0, 1)
            .map((image) => image.url) ?? []
        )
      }
      return []
    }),
  )
  await Promise.allSettled(
    [
      ...new Set(
        paths.filter(
          (path): path is string =>
            typeof path === "string" &&
            safeMediaUrl(path) !== undefined,
        ),
      ),
    ]
      .slice(0, 4)
      .map((path) => {
        return warmMedia({ path, signal })
      }),
  )
}
