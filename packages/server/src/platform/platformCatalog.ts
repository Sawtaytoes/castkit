import {
  builtinContractSchemas,
  type ChannelDefinition,
  CONTRACT_TYPES,
  type ViewDefinition,
} from "@castkit/sdk/contracts"
import {
  type AdapterDefinition,
  type CastKitPlugin,
  type PluginManifest,
  SDK_API_VERSION,
  type SettingField,
  type ViewInput,
  type ViewSpec,
} from "@castkit/sdk/plugin"
import { createAiUsageSource } from "./sources/aiUsage.ts"
import { createBambuddySource } from "./sources/bambuddy.ts"
import { createHomeAssistantSource } from "./sources/homeAssistant.ts"
import { createImmichSource } from "./sources/immich.ts"
import { createMqttSource } from "./sources/mqtt.ts"
import { createRipDeckSource } from "./sources/ripDeck.ts"

const urlField: SettingField = {
  key: "url",
  label: "Service URL",
  type: "text",
  isRequired: true,
}
const pollingField: SettingField = {
  key: "pollSeconds",
  label: "Refresh interval (seconds)",
  type: "number",
  defaultValue: 5,
}
const mediaFields: SettingField[] = [
  {
    key: "mediaUrl",
    label: "Media base URL",
    type: "text",
    description:
      "Resolve relative image URLs against this service.",
  },
  {
    key: "mediaOrigins",
    label: "Additional media origins",
    type: "string-list",
    description:
      "Only these administrator-approved origins may supply images.",
  },
]
const entityField: SettingField = {
  key: "entityIds",
  discoveryKey: "entities",
  label: "Entities",
  type: "string-list",
  isRequired: true,
  description:
    "Select entities from source discovery or enter their entity IDs.",
}
const adapters: AdapterDefinition[] = [
  {
    id: "bambuddy",
    name: "Bambuddy",
    description:
      "Printer jobs, camera snapshots, and print controls.",
    channelTypes: ["printers.v1", "cameras.v1"],
    settings: [
      urlField,
      { key: "apiKey", label: "API key", type: "secret" },
      pollingField,
    ],
    channelSettings: [
      {
        key: "printerIds",
        label: "Printers",
        type: "string-list",
        discoveryKey: "printers",
        description:
          "Leave empty to include every printer.",
      },
    ],
    actions: ["pause", "resume", "stop"].map((id) => ({
      id,
      name: id,
      isConfirmationRequired: true,
    })),
  },
  {
    id: "mqtt",
    name: "MQTT",
    description:
      "Subscribe to named MQTT channels using the configured broker.",
    channelTypes: Array.from(CONTRACT_TYPES),
    settings: [
      {
        key: "topicPrefix",
        label: "Topic prefix",
        type: "text",
        defaultValue: "castkit/channels",
      },
      ...mediaFields,
    ],
    channelSettings: [
      {
        key: "topic",
        label: "Data topic",
        type: "text",
        description:
          "Defaults to <prefix>/<channel ID>/set.",
      },
      {
        key: "historyHours",
        label: "Record numeric history (hours)",
        type: "number",
        defaultValue: 0,
        description:
          "Records numeric and text state changes from now; at most 720 hours (30 days) and 2,000 samples per entity. Existing Home Assistant history is not imported.",
      },
      {
        key: "commandTopic",
        label: "Command topic",
        type: "text",
      },
      {
        key: "actions",
        label: "Allowed actions",
        type: "string-list",
      },
    ],
    actions: [],
  },
  {
    id: "home-assistant",
    name: "Home Assistant",
    description:
      "Discover entities, read selected states, and run allowed actions.",
    channelTypes: [
      "entities.v1",
      "now-playing.v1",
      "weather.v1",
      "agenda.v1",
      "cameras.v1",
      "images.v1",
    ],
    settings: [
      urlField,
      {
        key: "token",
        label: "Access token",
        type: "secret",
        isRequired: true,
      },
      pollingField,
    ],
    channelSettings: [
      { ...entityField, isRequired: false },
      {
        key: "forecastType",
        label: "Forecast",
        type: "select",
        options: [
          { value: "none", label: "None" },
          { value: "hourly", label: "Hourly" },
          { value: "daily", label: "Daily" },
        ],
        defaultValue: "none",
      },
      {
        key: "entityListEntity",
        label:
          "Use an existing entity group or list helper",
        type: "text",
      },
      {
        key: "entityListAttribute",
        label: "List attribute",
        type: "text",
        defaultValue: "entity_id",
      },
      {
        key: "historyHours",
        label: "History window (hours)",
        type: "number",
        defaultValue: 0,
      },
      {
        key: "scriptFieldsJson",
        label: "Allowed script variables",
        type: "text",
        description:
          "JSON object mapping bound script IDs to allowed variable names.",
      },
    ],
    actions: [
      {
        id: "entity-action",
        name: "Run an entity action",
        isConfirmationRequired: true,
      },
    ],
  },
  {
    id: "immich",
    name: "Immich",
    description:
      "Select photos from albums, people, or a search.",
    channelTypes: ["images.v1"],
    settings: [
      urlField,
      {
        key: "apiKey",
        label: "API key",
        type: "secret",
        isRequired: true,
      },
      { ...pollingField, defaultValue: 3600 },
    ],
    channelSettings: [
      {
        key: "albumId",
        discoveryKey: "albums",
        label: "Album ID",
        type: "text",
      },
      {
        key: "personIds",
        discoveryKey: "people",
        label: "People IDs",
        type: "string-list",
      },
      {
        key: "peopleMinimum",
        label: "Minimum matching people",
        type: "number",
        defaultValue: 1,
      },
      { key: "query", label: "Photo search", type: "text" },
      {
        key: "assetLimit",
        label: "Photos in rotation",
        type: "number",
        defaultValue: 30,
      },
      {
        key: "recencyHalfLifeDays",
        label: "Recency half-life (days)",
        type: "number",
        defaultValue: 365,
      },
    ],
    actions: [],
  },
  {
    id: "rip-deck",
    name: "Rip Deck",
    description:
      "Monitor bays, disc jobs, poster art, and drive controls.",
    channelTypes: ["rip-deck.v1"],
    settings: [urlField, pollingField, ...mediaFields],
    channelSettings: [],
    actions: [
      "open_trays",
      "close_trays",
      "open_bay",
      "close_bay",
      "clear_loaded",
      "cancel",
      "keep_trying",
      "give_up",
      "clear_quarantine",
      "reset_bay",
      "retry_in_another_drive",
    ].map((id) => ({
      id,
      name: id.replaceAll("_", " "),
      isConfirmationRequired: true,
    })),
  },
  {
    id: "ai-usage",
    name: "AI Usage",
    description:
      "Remaining subscription usage for each AI provider. Credentials stay in AI Usage.",
    channelTypes: ["ai-usage.v1"],
    settings: [
      urlField,
      {
        ...pollingField,
        defaultValue: 300,
        description:
          "AI Usage refreshes its providers every five minutes, so a faster poll reads the same answer back.",
      },
    ],
    channelSettings: [
      {
        key: "providerIds",
        label: "Providers",
        type: "string-list",
        description:
          "Leave empty to include every provider.",
      },
    ],
    actions: [],
  },
  {
    id: "clock",
    name: "Clock",
    description:
      "CastKit's own clock. No external service is required.",
    channelTypes: ["time.v1"],
    settings: [],
    channelSettings: [],
    actions: [],
  },
]
const view = ({
  id,
  name,
  type,
  description = name,
}: {
  id: string
  name: string
  type?: string
  description?: string
}): ViewSpec => ({
  id,
  name,
  description,
  inputs: type
    ? [
        {
          key: "data",
          label: "Data",
          type,
          isRequired: true,
        },
      ]
    : [],
  settings: [],
  renderers: ["browser", "image"],
})
/** The current conditions a clock-bearing view shows beside the time. */
const optionalWeatherInput: ViewInput = {
  key: "weather",
  label: "Weather",
  type: "weather.v1",
  isRequired: false,
}
const imageSettings: SettingField[] = [
  {
    key: "fit",
    label: "Image fit",
    type: "select",
    defaultValue: "contain",
    options: [
      { value: "contain", label: "Fit whole image" },
      { value: "cover", label: "Fill view" },
    ],
  },
  {
    key: "intervalSeconds",
    label: "Photo interval (seconds)",
    type: "number",
    defaultValue: 60,
  },
  {
    key: "hasCaption",
    label: "Show captions",
    type: "boolean",
    defaultValue: false,
  },
]
const viewSpecs: ViewSpec[] = [
  {
    ...view({
      id: "text",
      name: "Text",
      description: "Static instructions or a note.",
    }),
    inputs: [
      {
        key: "conditions",
        label: "Visibility state",
        type: "entities.v1",
        isRequired: false,
      },
    ],
    settings: [
      { key: "title", label: "Title", type: "text" },
      { key: "content", label: "Content", type: "text" },
      {
        key: "visibleWhenJson",
        label: "Visibility conditions",
        type: "text",
      },
    ],
  },
  view({
    id: "now-playing",
    name: "Now Playing",
    type: "now-playing.v1",
  }),
  view({ id: "queue", name: "Queue", type: "queue.v1" }),
  view({ id: "clock", name: "Clock" }),
  {
    ...view({ id: "ambient", name: "Ambient clock" }),
    inputs: [optionalWeatherInput],
  },
  view({
    id: "weather",
    name: "Weather",
    type: "weather.v1",
  }),
  {
    ...view({ id: "calendar", name: "Agenda" }),
    inputs: [
      {
        key: "data",
        label: "Data",
        type: "agenda.v1",
        isRequired: true,
      },
      optionalWeatherInput,
    ],
  },
  {
    ...view({
      id: "photo-frame",
      name: "Photos",
      type: "images.v1",
    }),
    settings: imageSettings,
  },
  view({
    id: "printer-status",
    name: "Printer Status",
    type: "printers.v1",
  }),
  view({
    id: "rip-deck",
    name: "Rip Deck",
    type: "rip-deck.v1",
  }),
  {
    ...view({
      id: "points",
      name: "Points",
      type: "points.v1",
    }),
    minimumRepaint: "fast",
  },
  {
    ...view({
      id: "ai-usage",
      name: "AI Usage",
      type: "ai-usage.v1",
    }),
    settings: [
      {
        key: "alertPercent",
        label: "Show a second limit at (percent used)",
        type: "number",
        defaultValue: 80,
      },
    ],
  },
  view({
    id: "entities",
    name: "Entity controls",
    type: "entities.v1",
  }),
  {
    ...view({
      id: "cameras",
      name: "Cameras",
      type: "cameras.v1",
    }),
    renderers: ["browser"],
    minimumRepaint: "fast",
  },
  {
    ...view({
      id: "timers",
      name: "Timers",
      type: "entities.v1",
    }),
    settings: [
      {
        key: "createScriptId",
        label: "Create timer script",
        type: "text",
      },
      {
        key: "announceScriptId",
        label: "Announce timer script",
        type: "text",
      },
    ],
  },
  view({
    id: "map",
    name: "Locations",
    type: "entities.v1",
  }),
  view({
    id: "charts",
    name: "History charts",
    type: "entities.v1",
  }),
]
const clockSettings: SettingField[] = [
  {
    key: "hour12",
    label: "Use 12-hour time",
    type: "boolean",
    defaultValue: true,
  },
  { key: "locale", label: "Locale", type: "text" },
]
const entitySettings: SettingField[] = [
  {
    key: "actionVisibilityJson",
    label: "Visibility by action",
    type: "text",
    description:
      "JSON conditions keyed by entity and action.",
  },
  {
    key: "attributeFieldsJson",
    label: "Attribute fields",
    type: "text",
    description:
      "JSON list of entityId, attribute, label, and optional time/text/report format.",
  },
  {
    key: "entityVisibilityJson",
    label: "Visibility by entity",
    type: "text",
    description:
      "JSON object mapping entity IDs to visibility conditions.",
  },
  {
    key: "labelsFromEntitiesJson",
    label: "Labels from entities",
    type: "text",
    description:
      "JSON object mapping entity IDs to label-provider entity IDs.",
  },
  {
    key: "entityIds",
    label: "Displayed entities",
    type: "string-list",
  },
  {
    key: "aliasesJson",
    label: "Entity labels",
    type: "text",
    description:
      "JSON object mapping entity IDs to display labels.",
  },
  {
    key: "visibleWhenJson",
    label: "Visibility conditions",
    type: "text",
    description:
      "JSON condition or list of conditions against bound entity states.",
  },
  {
    key: "actionButtonsJson",
    label: "Action buttons",
    type: "text",
    description:
      "JSON list of named actions with bound entity IDs, payloads, and optional visibility conditions.",
  },
]
viewSpecs.forEach((spec) => {
  if (["clock", "ambient"].includes(spec.id)) {
    spec.settings = clockSettings
    spec.valueLifetimeMilliseconds = 60000
  }
  if (spec.id === "now-playing") {
    spec.valueLifetimeMilliseconds = 180000
  }
  if (spec.id === "printer-status") {
    spec.minimumRepaint = "fast"
    spec.settings = [
      {
        key: "isCameraVisible",
        label: "Show printer cameras",
        type: "boolean",
        defaultValue: true,
        description:
          "Shown on browser screens; touch displays can disable cameras.",
      },
    ]
  }
  if (spec.id === "rip-deck") {
    spec.minimumRepaint = "fast"
  }
  if (
    ["entities", "timers", "map", "charts"].includes(
      spec.id,
    )
  ) {
    spec.settings = spec.settings.concat(entitySettings)
  }
  if (spec.id === "charts") {
    spec.settings = spec.settings.concat([
      {
        key: "aggregation",
        label: "Aggregation",
        type: "select",
        defaultValue: "none",
        options: [
          { value: "none", label: "Every sample" },
          { value: "daily-mean", label: "Daily mean" },
        ],
      },
      {
        key: "chartType",
        label: "Chart type",
        type: "select",
        defaultValue: "line",
        options: [
          { value: "line", label: "Line" },
          { value: "bar", label: "Bar" },
        ],
      },
    ])
  }
  if (spec.id === "timers") {
    spec.settings = spec.settings.concat([
      {
        key: "hasHelperControls",
        label: "Show timer helper controls",
        type: "boolean",
        defaultValue: false,
      },
      {
        key: "createNameField",
        label: "Timer name variable",
        type: "text",
        defaultValue: "name",
      },
      {
        key: "createDurationField",
        label: "Timer duration variable",
        type: "text",
        defaultValue: "duration",
      },
      {
        key: "announceMessageField",
        label: "Announcement variable",
        type: "text",
        defaultValue: "message",
      },
    ])
  }
})
const sourceFactories: NonNullable<
  CastKitPlugin["adapters"]
> = {
  mqtt: createMqttSource,
  bambuddy: createBambuddySource,
  "home-assistant": createHomeAssistantSource,
  immich: createImmichSource,
  "rip-deck": createRipDeckSource,
  "ai-usage": createAiUsageSource,
  clock: (context) => {
    const publish = () =>
      context.channels.forEach((channel) => {
        context.publish({
          channelId: channel.id,
          data: { now: new Date().toISOString() },
        })
      })
    const timer = setInterval(publish, 1000)
    timer.unref()
    return {
      start: publish,
      dispose: () => clearInterval(timer),
    }
  },
}
const viewGroups = [
  {
    id: "clock-weather",
    name: "Clock and weather",
    specs: ["clock", "ambient", "weather"],
  },
  { id: "agenda", name: "Agenda", specs: ["calendar"] },
  { id: "photos", name: "Photos", specs: ["photo-frame"] },
  {
    id: "media",
    name: "Media playback",
    specs: ["now-playing", "queue"],
  },
  {
    id: "printers",
    name: "3D printers",
    specs: ["printer-status"],
  },
  { id: "rip-deck", name: "Rip Deck", specs: ["rip-deck"] },
  {
    id: "points",
    name: "Points",
    specs: ["points"],
  },
  {
    id: "ai-usage",
    name: "AI usage",
    specs: ["ai-usage"],
  },
  {
    id: "home-controls",
    name: "Home controls and history",
    specs: ["entities", "timers", "map", "charts"],
  },
  { id: "cameras", name: "Cameras", specs: ["cameras"] },
  {
    id: "text",
    name: "Text and instructions",
    specs: ["text"],
  },
]
const presetsByGroup: Record<
  string,
  NonNullable<PluginManifest["presets"]>
> = {
  agenda: [
    {
      id: "agenda-photos",
      name: "Agenda and photos",
      description: "Agenda beside a photo rotation.",
      layout: "split",
      panels: [
        { id: "agenda", specId: "calendar" },
        { id: "photos", specId: "photo-frame" },
      ],
    },
  ],
  "rip-deck": [
    {
      id: "rip-deck-printers",
      name: "Rip Deck and printers",
      description: "Disc jobs beside active 3D prints.",
      layout: "split",
      panels: [
        { id: "rips", specId: "rip-deck" },
        { id: "printers", specId: "printer-status" },
      ],
    },
  ],
}
/** Bundled capabilities use the same independent plugin boundaries as installed packages. */
const builtinPlugins: CastKitPlugin[] = [
  ...adapters.map((adapter) => ({
    manifest: {
      id: `castkit.source.${adapter.id}`,
      name: `${adapter.name} source`,
      version: "0.1.0",
      apiVersion: SDK_API_VERSION,
      adapters: [adapter],
      viewSpecs: [],
    },
    adapters: Object.fromEntries(
      Object.entries(sourceFactories).filter(
        ([id]) => id === adapter.id,
      ),
    ),
  })),
  ...viewGroups.map((group) => ({
    manifest: {
      id: `castkit.views.${group.id}`,
      name: group.name,
      version: "0.1.0",
      apiVersion: SDK_API_VERSION,
      adapters: [],
      viewSpecs: viewSpecs.filter((spec) =>
        group.specs.includes(spec.id),
      ),
      ...(presetsByGroup[group.id]
        ? { presets: presetsByGroup[group.id] }
        : {}),
    },
  })),
]
/** Validate installed extension metadata before executing any source factories. */
export const validatePluginManifest = (
  manifest: PluginManifest,
) => {
  if (manifest.apiVersion !== SDK_API_VERSION) {
    throw new Error("Unsupported CastKit SDK version.")
  }
  if (
    !/^[a-z0-9][a-z0-9._-]*$/.test(manifest.id) ||
    !manifest.name ||
    !/^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(
      manifest.version,
    )
  ) {
    throw new Error("Invalid plugin identity.")
  }
  if (
    !Array.isArray(manifest.adapters) ||
    !Array.isArray(manifest.viewSpecs)
  ) {
    throw new Error(
      "A plugin must declare adapters and view specs.",
    )
  }
  const isIdentifier = (value: unknown) =>
    typeof value === "string" &&
    /^[a-z0-9][a-z0-9._-]*$/.test(value)
  manifest.adapters.forEach((adapter) => {
    if (
      !isIdentifier(adapter.id) ||
      !adapter.name ||
      !Array.isArray(adapter.settings) ||
      !Array.isArray(adapter.channelSettings) ||
      !Array.isArray(adapter.actions) ||
      !Array.isArray(adapter.channelTypes)
    ) {
      throw new Error("Invalid source adapter definition.")
    }
  })
  manifest.viewSpecs.forEach((spec) => {
    if (
      !isIdentifier(spec.id) ||
      !spec.name ||
      !Array.isArray(spec.inputs) ||
      !Array.isArray(spec.renderers) ||
      !spec.renderers.length ||
      spec.renderers.some(
        (renderer) =>
          !["browser", "image"].includes(renderer),
      ) ||
      !Array.isArray(spec.settings)
    ) {
      throw new Error("Invalid view specification.")
    }
    if (
      spec.browserEntry &&
      !/^\/(?:assets\/plugins|api\/plugins\/assets)\/[a-zA-Z0-9_./-]+\.m?js$/.test(
        spec.browserEntry,
      )
    ) {
      throw new Error(
        "Plugin browser entries must be installed local assets.",
      )
    }
    if (spec.browserEntry?.split("/").includes("..")) {
      throw new Error("Invalid plugin asset path.")
    }
  })
  return manifest
}
/** Create an installation catalog from built-ins and explicitly trusted packages. */
const createCatalogSnapshot = ({
  plugins = [],
}: {
  plugins?: CastKitPlugin[]
} = {}) => {
  const registered = [...builtinPlugins, ...plugins]
  registered.forEach((plugin) => {
    if (
      Object.entries(plugin.adapters ?? {}).some(
        ([id, factory]) =>
          typeof factory !== "function" ||
          !plugin.manifest.adapters.some(
            (adapter) => adapter.id === id,
          ),
      )
    )
      throw new Error(
        "Plugin factories must match their declared adapters.",
      )
    if (
      Object.values(plugin.contracts ?? {}).some(
        (contract) => typeof contract?.parse !== "function",
      )
    )
      throw new Error(
        "Plugin contracts must supply a parser.",
      )
  })
  const manifests = registered.map((plugin) =>
    validatePluginManifest(plugin.manifest),
  )
  const allAdapters = manifests.flatMap(
    (manifest) => manifest.adapters,
  )
  const allViews = manifests.flatMap(
    (manifest) => manifest.viewSpecs,
  )
  const assertUnique = ({
    kind,
    ids,
  }: {
    kind: string
    ids: string[]
  }) => {
    if (new Set(ids).size !== ids.length) {
      throw new Error(`Duplicate ${kind} identifier.`)
    }
  }
  assertUnique({
    kind: "plugin",
    ids: manifests.map((manifest) => manifest.id),
  })
  assertUnique({
    kind: "adapter",
    ids: allAdapters.map((adapter) => adapter.id),
  })
  assertUnique({
    kind: "view",
    ids: allViews.map((spec) => spec.id),
  })
  assertUnique({
    kind: "contract",
    ids: [
      ...Object.keys(builtinContractSchemas),
      ...registered.flatMap((plugin) =>
        Object.keys(plugin.contracts ?? {}),
      ),
    ],
  })
  const contracts = new Map<
    string,
    { parse: (data: unknown) => unknown }
  >([
    ...Object.entries(builtinContractSchemas),
    ...registered.flatMap((plugin) =>
      Object.entries(plugin.contracts ?? {}),
    ),
  ])
  const adapterFactories = new Map(
    registered.flatMap((plugin) =>
      Object.entries(plugin.adapters ?? {}),
    ),
  )
  allAdapters.forEach((adapter) => {
    if (
      !adapterFactories.has(adapter.id) ||
      adapter.channelTypes.some(
        (type) => !contracts.has(type),
      )
    ) {
      throw new Error(
        `Adapter ${adapter.id} has no factory or uses an unknown contract.`,
      )
    }
  })
  allViews.forEach((spec) => {
    if (
      spec.inputs.some(
        (input) => !contracts.has(input.type),
      )
    ) {
      throw new Error(
        `View ${spec.id} uses an unknown contract.`,
      )
    }
  })
  const presets = manifests.flatMap(
    (manifest) => manifest.presets ?? [],
  )
  assertUnique({
    kind: "preset",
    ids: presets.map((preset) => preset.id),
  })
  presets.forEach((preset) => {
    if (
      !["single", "split", "grid"].includes(
        preset.layout,
      ) ||
      !Array.isArray(preset.panels) ||
      preset.panels.length === 0 ||
      preset.panels.some(
        (panel) =>
          !allViews.some(
            (spec) => spec.id === panel.specId,
          ),
      )
    ) {
      throw new Error(
        `Invalid composition preset: ${preset.id}`,
      )
    }
  })
  return {
    presets,
    plugins: manifests,
    adapters: allAdapters,
    viewSpecs: allViews,
    contracts,
    adapterFactories,
    getViewSpec: (id: string) =>
      allViews.find((spec) => spec.id === id),
    getAdapter: (id: string) =>
      allAdapters.find((adapter) => adapter.id === id),
    validateView: (
      definition: ViewDefinition,
      channels: ChannelDefinition[],
    ) => {
      definition.panels.forEach((panel) => {
        const spec = allViews.find(
          (entry) => entry.id === panel.specId,
        )
        if (!spec) {
          throw new Error(
            `Unknown view specification: ${panel.specId}`,
          )
        }
        spec.inputs.forEach((input) => {
          const channelId = panel.bindings[input.key]
          if (!channelId && !input.isRequired) {
            return
          }
          const channel = channels.find(
            (entry) => entry.id === channelId,
          )
          if (!channel || channel.type !== input.type) {
            throw new Error(
              `Input ${input.key} requires a ${input.type} channel.`,
            )
          }
        })
        Object.keys(panel.bindings).forEach((key) => {
          if (
            !spec.inputs.some((input) => input.key === key)
          ) {
            throw new Error(`Unknown view input: ${key}`)
          }
        })
      })
    },
  }
}
/** Keep consumer references stable while atomically replacing validated extension metadata. */
export const createPlatformCatalog = (
  options: { plugins?: CastKitPlugin[] } = {},
) => {
  const state = { current: createCatalogSnapshot(options) }
  const contracts = new Map(state.current.contracts)
  const adapterFactories = new Map(
    state.current.adapterFactories,
  )
  return {
    get plugins() {
      return state.current.plugins
    },
    get presets() {
      return state.current.presets
    },
    get adapters() {
      return state.current.adapters
    },
    get viewSpecs() {
      return state.current.viewSpecs
    },
    contracts,
    adapterFactories,
    getViewSpec: (id: string) =>
      state.current.getViewSpec(id),
    getAdapter: (id: string) =>
      state.current.getAdapter(id),
    validateView: (
      definition: ViewDefinition,
      channels: ChannelDefinition[],
    ) => state.current.validateView(definition, channels),
    replacePlugins: (plugins: CastKitPlugin[]) => {
      const next = createCatalogSnapshot({ plugins })
      contracts.clear()
      next.contracts.forEach((value, key) => {
        contracts.set(key, value)
      })
      adapterFactories.clear()
      next.adapterFactories.forEach((value, key) => {
        adapterFactories.set(key, value)
      })
      state.current = next
    },
  }
}
/** Catalog interface shared by persistence, source runtime, and management routes. */
export type PlatformCatalog = ReturnType<
  typeof createPlatformCatalog
>
