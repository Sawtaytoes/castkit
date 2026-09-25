import type {
  ChannelDefinition,
  ScreenDefinition,
  SourceDefinition,
  ViewDefinition,
} from "@castkit/sdk/contracts"
import type { Context, Hono } from "hono"
import { z } from "zod"
import { resolveSlatecastBuildId } from "../browser/pages.ts"
import { assertActionAllowed } from "./actionPolicy.ts"
import {
  getDisplayCompatibility,
  getPlatformDisplayCapabilities,
} from "./displayCompatibility.ts"
import { attachMapTiles } from "./mapTiles.ts"
import type { Platform } from "./platform.ts"
import { buildPlatformPage } from "./platformPages.ts"
import {
  hashPin,
  platformSchemas,
  verifyPin,
} from "./platformStore.ts"
import { attachPluginRoutes } from "./pluginRoutes.ts"

const targetKind = z.enum(["view", "screen"])
const pinSchema = z.string().min(4).max(128)
const isRecord = (
  value: unknown,
): value is Record<string, unknown> =>
  Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value),
  )
const getError = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The request could not be completed"
/** Resolve authorization on each request, including active-view changes and session expiry. */
export const getDisplay = ({
  platform,
  context,
  kind,
  id,
}: {
  platform: Platform
  context: Context
  kind: "view" | "screen"
  id: string
}) => {
  const deviceId = context.req.query("device")
  if (
    deviceId &&
    (kind !== "screen" ||
      platform.store.get().deviceScreens[deviceId] !== id)
  )
    return {
      error: "device-assignment-changed",
      status: 409 as const,
    }
  const target = platform.getTarget({ kind, id })
  if (!target)
    return {
      error: "unknown display",
      status: 404 as const,
    }
  const { view, screen } = target
  const isProtected =
    screen?.access === "pin" || view.access === "pin"
  const isAuthorized = platform.access.canAccess({
    context,
    kind,
    id,
  })
  if (isProtected && !isAuthorized)
    return {
      error: "locked",
      name: screen?.name ?? view.name,
      status: 401 as const,
    }
  const displayProperties = deviceId
    ? platform.getDeviceProperties(deviceId)
    : undefined
  const channels = platform.channelsForView(view)
  const rewriteMedia = (value: unknown): unknown => {
    if (
      typeof value === "string" &&
      value.startsWith("/api/platform/channels/")
    ) {
      return value.replace(
        /^\/api\/platform\/channels\/([^/]+)\/media\//,
        `/api/display/${kind}/${id}/media/$1/`,
      )
    }
    if (Array.isArray(value)) return value.map(rewriteMedia)
    if (isRecord(value))
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          rewriteMedia(item),
        ]),
      )
    return value
  }
  return {
    snapshot: {
      target: { kind, id },
      displayProperties,
      displayCapabilities: displayProperties
        ? getPlatformDisplayCapabilities(displayProperties)
        : undefined,
      view,
      screen: screen && {
        ...screen,
        activeViewId: view.id,
      },
      availableViews: screen
        ? screen.viewIds.flatMap((viewId) => {
            const candidate = platform.store
              .get()
              .views.find((item) => item.id === viewId)
            return candidate
              ? [{ id: candidate.id, name: candidate.name }]
              : []
          })
        : undefined,
      channels: rewriteMedia(channels),
      viewSpecs: platform.catalog.viewSpecs.filter((spec) =>
        view.panels.some(
          (panel) => panel.specId === spec.id,
        ),
      ),
      canControl: view.isControlEnabled,
      buildId: resolveSlatecastBuildId(),
    },
  }
}
/** Register all management, access, viewer, media, and action endpoints before legacy API middleware. */
export const attachPlatformRoutes = ({
  app,
  platform,
  apiToken = "",
}: {
  app: Hono
  platform: Platform
  apiToken?: string
}) => {
  const { store, access, catalog, runtime } = platform
  const getEnabledPlugins = () =>
    catalog.plugins.filter(
      (plugin) =>
        !store.get().disabledPluginIds.includes(plugin.id),
    )
  const isAdapterEnabled = (id: string) =>
    getEnabledPlugins().some((plugin) =>
      plugin.adapters.some((adapter) => adapter.id === id),
    )
  const isViewSpecEnabled = (id: string) =>
    getEnabledPlugins().some((plugin) =>
      plugin.viewSpecs.some((spec) => spec.id === id),
    )
  app.use("/api/*", async (context, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(
        context.req.method,
      ) &&
      !access.isSameOrigin(context)
    )
      return context.json(
        { error: "Cross-origin requests are not allowed" },
        403,
      )
    await next()
  })
  app.use("/api/manage/*", async (context, next) => {
    if (!access.isAdmin(context))
      return context.json(
        { error: "Management PIN required" },
        401,
      )
    if (
      platform.pluginRuntime.isChanging &&
      !["GET", "HEAD", "OPTIONS"].includes(
        context.req.method,
      )
    )
      return context.json(
        {
          error:
            "A plugin change is in progress. Try again when it finishes.",
        },
        409,
      )
    await next()
  })
  attachPluginRoutes({
    app,
    plugins: platform.pluginRuntime,
  })
  app.get("/api/access/session", (context) =>
    context.json({
      isAuthenticated: access.isAdmin(context),
      isSetupRequired: !store.get().adminHash,
    }),
  )
  app.post("/api/access/setup", async (context) => {
    const parsed = z
      .object({
        pin: pinSchema,
        setupToken: z.string().optional(),
      })
      .safeParse(await context.req.json().catch(() => null))
    if (!parsed.success)
      return context.json(
        {
          error:
            "Use a PIN or password with at least four characters",
        },
        400,
      )
    if (!access.checkAttempt("admin-setup"))
      return context.json(
        {
          error:
            "Please wait one minute before another attempt",
        },
        429,
      )
    if (
      !access.setup({
        pin: parsed.data.pin,
        setupToken: access.isMachine(context)
          ? store.get().setupToken
          : (parsed.data.setupToken ?? ""),
      })
    )
      return context.json(
        {
          error:
            "Setup token is invalid or setup is already complete",
        },
        403,
      )
    access.issue({ context, isAdminSession: true })
    return context.json({ isAuthenticated: true })
  })
  app.post("/api/access/login", async (context) => {
    const input = await context.req.json().catch(() => ({}))
    if (!access.checkAttempt("admin-login"))
      return context.json(
        {
          error:
            "Please wait one minute before another attempt",
        },
        429,
      )
    if (
      typeof input.pin !== "string" ||
      !access.verifyAdmin(input.pin)
    )
      return context.json({ error: "Incorrect PIN" }, 401)
    access.issue({ context, isAdminSession: true })
    return context.json({ isAuthenticated: true })
  })
  app.post("/api/access/change-pin", async (context) => {
    if (!access.isAdmin(context))
      return context.json(
        { error: "Management PIN required" },
        401,
      )
    const parsed = z
      .object({ currentPin: z.string(), newPin: pinSchema })
      .safeParse(await context.req.json().catch(() => null))
    if (!parsed.success)
      return context.json(
        {
          error:
            "Use a PIN or password with at least four characters",
        },
        400,
      )
    if (!access.checkAttempt("admin-change"))
      return context.json(
        {
          error:
            "Please wait one minute before another attempt",
        },
        429,
      )
    if (!access.verifyAdmin(parsed.data.currentPin))
      return context.json(
        { error: "Incorrect current PIN" },
        401,
      )
    store.update((previous) => ({
      ...previous,
      adminHash: hashPin(parsed.data.newPin),
      sessions: [],
    }))
    access.issue({ context, isAdminSession: true })
    platform.notify()
    return context.json({ ok: true })
  })
  app.post("/api/access/logout", (context) => {
    access.logout(context)
    platform.notify()
    return context.json({ ok: true })
  })
  app.post("/api/access/unlock", async (context) => {
    const parsed = z
      .object({
        kind: targetKind,
        id: z.string(),
        pin: pinSchema,
      })
      .safeParse(await context.req.json().catch(() => null))
    if (!parsed.success)
      return context.json(
        { error: "Invalid unlock request" },
        400,
      )
    const { kind, id, pin } = parsed.data
    const target = platform.getTarget({ kind, id })
    if (!target)
      return context.json({ error: "Unknown display" }, 404)
    if (!access.checkAttempt(`${kind}:${id}`))
      return context.json(
        {
          error:
            "Please wait one minute before another attempt",
        },
        429,
      )
    if (
      !verifyPin({
        pin,
        hash: store.get().pinHashes[`${kind}:${id}`],
      })
    )
      return context.json({ error: "Incorrect PIN" }, 401)
    access.issue({
      context,
      grant: {
        kind,
        id,
        minutes: (target.screen ?? target.view)
          .sessionMinutes,
      },
    })
    return context.json({ ok: true })
  })
  app.post("/api/access/lock", async (context) => {
    const parsed = z
      .object({ kind: targetKind, id: z.string() })
      .safeParse(await context.req.json().catch(() => null))
    if (!parsed.success)
      return context.json(
        { error: "Invalid lock request" },
        400,
      )
    access.lock({ context, ...parsed.data })
    platform.notify()
    return context.json({ ok: true })
  })
  app.use("/api/devices/:id/*", async (context, next) => {
    const screenId =
      store.get().deviceScreens[
        context.req.param("id") ?? ""
      ]
    if (screenId) {
      const result = getDisplay({
        platform,
        context,
        kind: "screen",
        id: screenId,
      })
      if (!result.snapshot)
        return context.json(result, result.status)
    }
    await next()
  })
  app.get("/api/views", (context) =>
    context.json({
      views: store
        .get()
        .views.map(({ id, name, access: policy }) => ({
          id,
          name,
          access: policy,
        })),
      screens: store
        .get()
        .screens.map(({ id, name, access: policy }) => ({
          id,
          name,
          access: policy,
        })),
    }),
  )
  app.get("/api/manage/platform", (context) =>
    context.json({
      ...store.public(),
      screens: store.public().screens.map((screen) => ({
        ...screen,
        activeViewId:
          platform.screens.getActiveViewId(screen),
      })),
      pluginPackages: platform.pluginRuntime.list(),
      pluginErrors: platform.pluginRuntime.getErrors(),
      isPluginInstallationAvailable:
        platform.pluginRuntime.isAvailable,
      plugins: catalog.plugins.map((plugin) => ({
        ...plugin,
        isEnabled: !store
          .get()
          .disabledPluginIds.includes(plugin.id),
      })),
      presets: getEnabledPlugins().flatMap((plugin) =>
        (plugin.presets ?? []).filter((preset) =>
          preset.panels.every((panel) =>
            isViewSpecEnabled(panel.specId),
          ),
        ),
      ),
      adapters: catalog.adapters.filter((adapter) =>
        isAdapterEnabled(adapter.id),
      ),
      viewSpecs: catalog.viewSpecs.filter((spec) =>
        isViewSpecEnabled(spec.id),
      ),
      channelStates: Object.fromEntries(
        platform.hub
          .list()
          .map((snapshot) => [snapshot.id, snapshot]),
      ),
    }),
  )

  app.put(
    "/api/manage/platform/plugins/:id",
    async (context) => {
      const id = context.req.param("id")
      const plugin = catalog.plugins.find(
        (item) => item.id === id,
      )
      if (!plugin)
        return context.json(
          { error: "Unknown plugin" },
          404,
        )
      const parsed = z
        .object({ isEnabled: z.boolean() })
        .safeParse(
          await context.req.json().catch(() => null),
        )
      if (!parsed.success)
        return context.json(
          { error: "Choose whether the plugin is enabled" },
          400,
        )
      const isUsed =
        store
          .get()
          .sources.some((source) =>
            plugin.adapters.some(
              (adapter) => adapter.id === source.adapter,
            ),
          ) ||
        store
          .get()
          .views.some((view) =>
            view.panels.some((panel) =>
              plugin.viewSpecs.some(
                (spec) => spec.id === panel.specId,
              ),
            ),
          )
      if (!parsed.data.isEnabled && isUsed)
        return context.json(
          {
            error:
              "Remove this plugin's configured sources and views before disabling it",
          },
          409,
        )
      store.update((previous) => ({
        ...previous,
        disabledPluginIds: parsed.data.isEnabled
          ? previous.disabledPluginIds.filter(
              (pluginId) => pluginId !== id,
            )
          : Array.from(
              new Set([...previous.disabledPluginIds, id]),
            ),
      }))
      platform.notify()
      return context.json({ ok: true })
    },
  )

  const saveRecord = async ({
    context,
    collection,
  }: {
    context: Context
    collection: keyof typeof platformSchemas
  }) => {
    const input = await context.req.json().catch(() => null)
    const parsed =
      platformSchemas[collection].safeParse(input)
    if (!parsed.success)
      return context.json(
        {
          error: parsed.error.issues
            .map(
              (issue) =>
                `${issue.path.join(".")}: ${issue.message}`,
            )
            .join("; "),
        },
        400,
      )
    const record = parsed.data
    const id = context.req.param("id")
    if (id && id !== record.id)
      return context.json(
        { error: "An existing identifier cannot change" },
        400,
      )
    const previous = store.get()
    if (
      context.req.method === "POST" &&
      previous[collection].some(
        (item) => item.id === record.id,
      )
    )
      return context.json(
        { error: "This identifier already exists" },
        409,
      )
    if (
      context.req.method === "PUT" &&
      !previous[collection].some(
        (item) => item.id === record.id,
      )
    )
      return context.json({ error: "Unknown item" }, 404)
    try {
      if (collection === "sources") {
        const source = record as SourceDefinition
        const adapter = catalog.getAdapter(source.adapter)
        if (!adapter || !isAdapterEnabled(source.adapter))
          throw new Error(
            "Unknown or disabled source adapter",
          )
        if (
          previous.channels.some(
            (channel) =>
              channel.sourceId === source.id &&
              !adapter.channelTypes.includes(channel.type),
          )
        )
          throw new Error(
            "Existing channels are incompatible with this adapter",
          )
        const secretFields = new Set(
          adapter.settings
            .filter((field) => field.type === "secret")
            .map((field) => field.key),
        )
        if (
          Object.keys(source.settings).some((key) =>
            secretFields.has(key),
          )
        )
          throw new Error(
            "Credentials must be supplied through the secrets field",
          )
      }
      if (collection === "channels") {
        const channel = record as ChannelDefinition
        const source = previous.sources.find(
          (item) => item.id === channel.sourceId,
        )
        if (
          !source ||
          !catalog
            .getAdapter(source.adapter)
            ?.channelTypes.includes(channel.type)
        )
          throw new Error(
            "The source does not provide this channel type",
          )
        previous.views.forEach((view) => {
          catalog.validateView(view, [
            ...previous.channels.filter(
              (item) => item.id !== channel.id,
            ),
            channel,
          ])
        })
      }
      if (collection === "views") {
        const view = record as ViewDefinition
        if (
          view.panels.some(
            (panel) => !isViewSpecEnabled(panel.specId),
          )
        )
          throw new Error(
            "A view plugin is disabled or unavailable",
          )
        catalog.validateView(view, previous.channels)
        if (
          view.layout === "single" &&
          view.panels.length !== 1
        )
          throw new Error(
            "A single layout needs exactly one panel",
          )
        if (
          new Set(view.panels.map((panel) => panel.id))
            .size !== view.panels.length
        )
          throw new Error(
            "Panel identifiers must be unique",
          )
        if (
          view.access === "pin" &&
          previous.screens.some(
            (screen) =>
              screen.access === "public" &&
              screen.viewIds.includes(view.id),
          )
        )
          throw new Error(
            "Protect the screens that use this view before making it private",
          )
      }
      if (collection === "screens") {
        const screen = record as ScreenDefinition
        if (
          !screen.viewIds.includes(screen.defaultViewId) ||
          screen.viewIds.some(
            (viewId) =>
              !previous.views.some(
                (view) => view.id === viewId,
              ),
          )
        )
          throw new Error(
            "Select existing views and include the default view",
          )
        if (
          screen.access === "public" &&
          previous.views.some(
            (view) =>
              view.access === "pin" &&
              screen.viewIds.includes(view.id),
          )
        )
          throw new Error(
            "A public screen cannot contain private views",
          )
      }
      const kind =
        collection === "views" ? "view" : "screen"
      const pinKey = `${kind}:${record.id}`
      const hasPinInput =
        (collection === "views" ||
          collection === "screens") &&
        typeof input.pin === "string" &&
        input.pin.length > 0
      if (
        hasPinInput &&
        !z
          .string()
          .regex(/^\d{4,32}$/)
          .safeParse(input.pin).success
      )
        throw new Error(
          "Use four to 32 digits for a kiosk PIN",
        )
      if (
        (collection === "views" ||
          collection === "screens") &&
        "access" in record &&
        record.access === "pin" &&
        !hasPinInput &&
        !previous.pinHashes[pinKey]
      )
        throw new Error(
          "Set a PIN for this private display",
        )
      if (
        input.secrets !== undefined &&
        !z
          .record(z.string(), z.string())
          .safeParse(input.secrets).success
      )
        throw new Error("Invalid source credentials")
      const nextSecrets =
        collection === "sources" && isRecord(input.secrets)
          ? {
              ...previous.secrets,
              [record.id]: {
                ...previous.secrets[record.id],
                ...(input.secrets as Record<
                  string,
                  string
                >),
              },
            }
          : previous.secrets
      const candidateViews =
        collection === "views"
          ? [
              ...previous.views.filter(
                (view) => view.id !== record.id,
              ),
              record as ViewDefinition,
            ]
          : previous.views
      const candidateScreens =
        collection === "screens"
          ? [
              ...previous.screens.filter(
                (screen) => screen.id !== record.id,
              ),
              record as ScreenDefinition,
            ]
          : previous.screens
      Object.entries(previous.deviceScreens).forEach(
        ([deviceId, screenId]) => {
          const display =
            platform.getDeviceProperties(deviceId)
          const screen = candidateScreens.find(
            (item) => item.id === screenId,
          )
          if (display && screen)
            screen.viewIds.forEach((viewId) => {
              const view = candidateViews.find(
                (item) => item.id === viewId,
              )
              if (view) {
                const result = getDisplayCompatibility({
                  view,
                  catalog,
                  display,
                })
                if (!result.isCompatible)
                  throw new Error(result.reasons.join(" "))
              }
            })
        },
      )
      store.update((state) => ({
        ...state,
        [collection]: [
          ...state[collection].filter(
            (item) => item.id !== record.id,
          ),
          collection === "screens"
            ? {
                ...record,
                activeViewId: (
                  record as ScreenDefinition
                ).viewIds.includes(
                  state.screens.find(
                    (screen) => screen.id === record.id,
                  )?.activeViewId ?? "",
                )
                  ? state.screens.find(
                      (screen) => screen.id === record.id,
                    )?.activeViewId
                  : undefined,
              }
            : record,
        ],
        secrets: nextSecrets,
        pinHashes: hasPinInput
          ? {
              ...state.pinHashes,
              [pinKey]: hashPin(input.pin),
            }
          : state.pinHashes,
        sessions: hasPinInput
          ? state.sessions.map((session) => ({
              ...session,
              grants: session.grants.filter(
                (grant) =>
                  !(
                    grant.kind === kind &&
                    grant.id === record.id
                  ),
              ),
            }))
          : state.sessions,
      }))
      await platform.refresh()
      return context.json(
        { ok: true },
        context.req.method === "POST" ? 201 : 200,
      )
    } catch (error) {
      return context.json({ error: getError(error) }, 400)
    }
  }
  ;(
    Object.keys(
      platformSchemas,
    ) as (keyof typeof platformSchemas)[]
  ).forEach((collection) => {
    app.post(
      `/api/manage/platform/${collection}`,
      (context) => saveRecord({ context, collection }),
    )
    app.put(
      `/api/manage/platform/${collection}/:id`,
      (context) => saveRecord({ context, collection }),
    )
    app.delete(
      `/api/manage/platform/${collection}/:id`,
      async (context) => {
        const id = context.req.param("id")
        const previous = store.get()
        if (
          !previous[collection].some(
            (item) => item.id === id,
          )
        )
          return context.json(
            { error: "Unknown item" },
            404,
          )
        const isUsed =
          collection === "sources"
            ? previous.channels.some(
                (channel) => channel.sourceId === id,
              )
            : collection === "channels"
              ? previous.views.some((view) =>
                  view.panels.some((panel) =>
                    Object.values(panel.bindings).includes(
                      id,
                    ),
                  ),
                )
              : collection === "views"
                ? previous.screens.some((screen) =>
                    screen.viewIds.includes(id),
                  )
                : Object.values(
                    previous.deviceScreens,
                  ).includes(id)
        if (isUsed)
          return context.json(
            {
              error:
                "Remove this item's assignments before deleting it",
            },
            409,
          )
        store.update((state) => ({
          ...state,
          [collection]: state[collection].filter(
            (item) => item.id !== id,
          ),
          secrets:
            collection === "sources"
              ? Object.fromEntries(
                  Object.entries(state.secrets).filter(
                    ([key]) => key !== id,
                  ),
                )
              : state.secrets,
          pinHashes: Object.fromEntries(
            Object.entries(state.pinHashes).filter(
              ([key]) =>
                key !==
                `${collection === "views" ? "view" : "screen"}:${id}`,
            ),
          ),
          sessions: state.sessions.map((session) => ({
            ...session,
            grants: session.grants.filter(
              (grant) =>
                !(
                  grant.id === id &&
                  `${grant.kind}s` === collection
                ),
            ),
          })),
        }))
        if (collection === "screens") {
          /* Discovery removal is handled by the platform refresh. */
        }
        await platform.refresh()
        return context.json({ ok: true })
      },
    )
  })
  app.post(
    "/api/manage/platform/sources/:id/discover",
    async (context) => {
      try {
        return context.json(
          await runtime.discover(context.req.param("id")),
        )
      } catch (error) {
        return context.json({ error: getError(error) }, 400)
      }
    },
  )
  app.post(
    "/api/manage/platform/screens/:id/select",
    async (context) => {
      const parsed = z
        .object({
          viewId: z.string(),
          durationSeconds: z.number().optional(),
          priority: z.number().optional(),
        })
        .safeParse(
          await context.req.json().catch(() => null),
        )
      if (!parsed.success)
        return context.json(
          { error: "Invalid screen selection" },
          400,
        )
      try {
        platform.screens.select({
          screenId: context.req.param("id"),
          ...parsed.data,
        })
        return context.json({ ok: true })
      } catch (error) {
        return context.json({ error: getError(error) }, 400)
      }
    },
  )
  app.put(
    "/api/manage/platform/device-screens/:id",
    async (context) => {
      const parsed = z
        .object({ screenId: z.string().nullable() })
        .safeParse(
          await context.req.json().catch(() => null),
        )
      if (
        !parsed.success ||
        (parsed.data.screenId &&
          !store
            .get()
            .screens.some(
              (screen) =>
                screen.id === parsed.data.screenId,
            ))
      )
        return context.json(
          { error: "Unknown screen" },
          400,
        )
      const id = context.req.param("id")
      const display = platform.getDeviceProperties(id)
      if (!display)
        return context.json(
          { error: "Unknown device" },
          404,
        )
      const screen = store
        .get()
        .screens.find(
          (item) => item.id === parsed.data.screenId,
        )
      const reasons =
        screen?.viewIds.flatMap((viewId) => {
          const view = store
            .get()
            .views.find((item) => item.id === viewId)
          return view
            ? getDisplayCompatibility({
                view,
                catalog,
                display,
              }).reasons
            : ["Unknown view"]
        }) ?? []
      if (reasons.length)
        return context.json(
          { error: reasons.join(" ") },
          400,
        )
      store.update((previous) => ({
        ...previous,
        deviceScreens: Object.fromEntries([
          ...Object.entries(previous.deviceScreens).filter(
            ([deviceId]) => deviceId !== id,
          ),
          ...(parsed.data.screenId
            ? [[id, parsed.data.screenId]]
            : []),
        ]),
      }))
      platform.notify()
      return context.json({ ok: true })
    },
  )
  app.get("/api/display/:kind/:id", (context) => {
    const kind = targetKind.safeParse(
      context.req.param("kind"),
    )
    if (!kind.success)
      return context.json(
        { error: "Unknown display type" },
        404,
      )
    const result = getDisplay({
      platform,
      context,
      kind: kind.data,
      id: context.req.param("id"),
    })
    return "snapshot" in result
      ? context.json(result.snapshot)
      : context.json(result, result.status)
  })
  app.post(
    "/api/display/screen/:id/select",
    async (context) => {
      const id = context.req.param("id")
      const result = getDisplay({
        platform,
        context,
        kind: "screen",
        id,
      })
      if (!("snapshot" in result))
        return context.json(result, result.status)
      const parsed = z
        .object({ viewId: z.string() })
        .safeParse(
          await context.req.json().catch(() => null),
        )
      if (!parsed.success)
        return context.json(
          { error: "Select an allowed view" },
          400,
        )
      if (
        !result.snapshot?.screen?.viewIds.includes(
          parsed.data.viewId,
        )
      )
        return context.json(
          {
            error:
              "This view is not available on this screen",
          },
          403,
        )
      platform.screens.select({
        screenId: id,
        viewId: parsed.data.viewId,
      })
      const selected = getDisplay({
        platform,
        context,
        kind: "screen",
        id,
      })
      return "snapshot" in selected
        ? context.json(selected.snapshot)
        : context.json(selected, selected.status)
    },
  )
  app.post(
    "/api/display/:kind/:id/actions",
    async (context) => {
      const kind = targetKind.safeParse(
        context.req.param("kind"),
      )
      if (!kind.success)
        return context.json(
          { error: "Unknown display type" },
          404,
        )
      const result = getDisplay({
        platform,
        context,
        kind: kind.data,
        id: context.req.param("id"),
      })
      if (!result.snapshot)
        return context.json(result, result.status)
      if (!result.snapshot.canControl)
        return context.json(
          { error: "This view is read-only" },
          403,
        )
      const parsed = z
        .object({
          panelId: z.string(),
          input: z.string().optional(),
          action: z.string(),
          payload: z
            .record(z.string(), z.unknown())
            .default({}),
        })
        .safeParse(
          await context.req.json().catch(() => null),
        )
      if (!parsed.success)
        return context.json(
          { error: "Invalid action" },
          400,
        )
      const { panelId, input, action, payload } =
        parsed.data
      const panel = result.snapshot.view.panels.find(
        (item) => item.id === panelId,
      )
      if (!panel)
        return context.json({ error: "Unknown panel" }, 404)
      const spec = catalog.getViewSpec(panel.specId)
      const inputKey =
        input ?? spec?.inputs[0]?.key ?? "data"
      if (
        !spec?.inputs.some(
          (value) => value.key === inputKey,
        )
      )
        return context.json(
          { error: "Unknown panel input" },
          400,
        )
      const channelId = panel.bindings[inputKey]
      if (!channelId)
        return context.json(
          { error: "This panel has no control source" },
          400,
        )
      if (platform.hub.get(channelId)?.status !== "ready")
        return context.json(
          { error: "The source is not ready for controls" },
          409,
        )
      try {
        assertActionAllowed({
          panel,
          channels: platform.channelsForView(
            result.snapshot.view,
          ),
          channelId,
          action,
          payload,
        })
        return context.json({
          result: await runtime.executeAction({
            channelId,
            action,
            payload,
          }),
        })
      } catch (error) {
        return context.json({ error: getError(error) }, 400)
      }
    },
  )
  app.get(
    "/api/display/:kind/:id/media/:channelId/:assetId",
    async (context) => {
      const kind = targetKind.safeParse(
        context.req.param("kind"),
      )
      if (!kind.success)
        return context.json(
          { error: "Unknown display type" },
          404,
        )
      const result = getDisplay({
        platform,
        context,
        kind: kind.data,
        id: context.req.param("id"),
      })
      if (!result.snapshot)
        return context.json(result, result.status)
      const channelId = context.req.param("channelId")
      if (
        !result.snapshot.view.panels.some((panel) =>
          Object.values(panel.bindings).includes(channelId),
        )
      )
        return context.json(
          {
            error:
              "Channel is not assigned to this display",
          },
          403,
        )
      return sendMedia({ context, runtime })
    },
  )
  app.get(
    "/api/platform/channels/:channelId/media/:assetId",
    async (context) => {
      if (!access.isAdmin(context))
        return context.json(
          { error: "Management PIN required" },
          401,
        )
      return sendMedia({ context, runtime })
    },
  )
  app.get("/view/:id", (context) =>
    platform.getTarget({
      kind: "view",
      id: context.req.param("id"),
    })
      ? context.html(buildPlatformPage())
      : context.text("Unknown view", 404),
  )
  app.get("/screen/:id", (context) =>
    platform.getTarget({
      kind: "screen",
      id: context.req.param("id"),
    })
      ? context.html(buildPlatformPage())
      : context.text("Unknown screen", 404),
  )
  attachMapTiles({ app, platform })
  // Keep machine API behavior compatible while allowing an authenticated management session.
  if (apiToken)
    app.use("/api/*", async (context, next) => {
      if (!access.isAdmin(context))
        return context.json(
          { error: "API token required" },
          401,
        )
      await next()
    })
}

const sendMedia = async ({
  context,
  runtime,
}: {
  context: Context
  runtime: Platform["runtime"]
}) => {
  try {
    const response = await runtime.getMedia({
      channelId: context.req.param("channelId") ?? "",
      assetId: context.req.param("assetId") ?? "",
      kind: context.req.query("kind"),
    })
    if (!response.ok)
      return context.json(
        { error: "Media is unavailable" },
        502,
      )
    const contentType =
      response.headers.get("content-type") ??
      "application/octet-stream"
    if (
      !/^(image\/(jpeg|png|webp|gif|avif)|video\/(mp4|webm)|multipart\/x-mixed-replace)/i.test(
        contentType,
      )
    )
      return context.json(
        { error: "Unsupported media format" },
        415,
      )
    return new Response(response.body, {
      headers: {
        "content-type": contentType,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    })
  } catch {
    return context.json(
      { error: "Media is unavailable" },
      502,
    )
  }
}
