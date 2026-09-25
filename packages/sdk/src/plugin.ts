import type {
  ChannelDefinition,
  SourceDefinition,
} from "./contracts.ts"

/** Current extension API major. Unsupported packages are rejected at registration. */
export const SDK_API_VERSION = 1
/** A portable settings field rendered by the host management interface. */
export type SettingField = {
  key: string
  label: string
  type:
    | "text"
    | "number"
    | "boolean"
    | "select"
    | "secret"
    | "string-list"
  description?: string
  discoveryKey?: string
  isRequired?: boolean
  defaultValue?: unknown
  options?: { value: string; label: string }[]
}
/** A view can only bind channels implementing its required contract. */
export type ViewInput = {
  key: string
  label: string
  type: string
  isRequired: boolean
}
/** An action name is explicitly advertised instead of exposing arbitrary upstream URLs. */
export type ActionDefinition = {
  id: string
  name: string
  isConfirmationRequired?: boolean
}
/** Serializable source adapter metadata. */
export type AdapterDefinition = {
  id: string
  name: string
  description: string
  channelTypes: string[]
  settings: SettingField[]
  channelSettings: SettingField[]
  actions: ActionDefinition[]
}
/** Renderer entry points are supplied by trusted installed packages during the build. */
export type ViewSpec = {
  id: string
  name: string
  description: string
  inputs: ViewInput[]
  settings: SettingField[]
  renderers: ("browser" | "image")[]
  actions?: ActionDefinition[]
  browserEntry?: string
  imageEntry?: string
  valueLifetimeMilliseconds?: number
  minimumRepaint?:
    | "instant"
    | "fast"
    | "slow"
    | "super-slow"
}
/** A reusable arrangement supplied by a view extension; users bind its inputs. */
export type CompositionPreset = {
  id: string
  name: string
  description: string
  layout: "single" | "split" | "grid"
  panels: {
    id: string
    specId: string
    settings?: Record<string, unknown>
  }[]
}
/** Public plugin metadata. No executable values or credentials reach clients. */
export type PluginManifest = {
  id: string
  name: string
  version: string
  apiVersion: number
  adapters: AdapterDefinition[]
  viewSpecs: ViewSpec[]
  presets?: CompositionPreset[]
}
/** MQTT transport injected by the application; sources do not own the broker client. */
export type MqttTransport = {
  subscribe: (topic: string) => undefined | Promise<unknown>
  unsubscribe?: (
    topic: string,
  ) => undefined | Promise<unknown>
  publish: (request: {
    topic: string
    payload: string
    isRetained?: boolean
  }) => undefined | Promise<unknown>
}
/** Runtime dependencies made available to a trusted source extension. */
export type SourceContext = {
  source: SourceDefinition
  channels: ChannelDefinition[]
  secrets: Record<string, string>
  appendHistory?: (request: {
    channelId: string
    entities: import("./contracts.ts").ContractData["entities.v1"]["entities"]
    hours: number
  }) => import("./contracts.ts").ContractData["entities.v1"]["entities"]
  signal: AbortSignal
  fetch: typeof fetch
  mqtt?: MqttTransport
  publish: (request: {
    channelId: string
    data: unknown
  }) => void
  reportError: (request: {
    channelId: string
    error: string
  }) => void
}
/** A channel-targeted control after host authentication and binding checks. */
export type SourceAction = {
  channelId: string
  action: string
  payload: Record<string, unknown>
}
/** A running source releases every timer and subscription on dispose. */
export type SourceInstance = {
  start?: () => void | Promise<void>
  dispose: () => void
  handleMqttMessage?: (request: {
    topic: string
    payload: string
  }) => void
  executeAction?: (
    request: SourceAction,
  ) => Promise<unknown>
  discover?: () => Promise<unknown>
  getMedia?: (request: {
    channelId: string
    assetId: string
    kind?: string
  }) => Promise<Response>
}
/** A factory is run only for an explicitly configured, enabled source. */
export type SourceFactory = (
  context: SourceContext,
) => SourceInstance
/** Executable contracts and factories stay on the server. */
export type CastKitPlugin = {
  manifest: PluginManifest
  adapters?: Record<string, SourceFactory>
  contracts?: Record<
    string,
    { parse: (data: unknown) => unknown }
  >
}
