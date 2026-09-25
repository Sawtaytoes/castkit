import type {
  ChannelDefinition,
  ScreenDefinition,
  SourceDefinition,
  ViewDefinition,
  ViewPanel,
} from "@castkit/sdk/contracts"
import type {
  AdapterDefinition,
  CompositionPreset,
  SettingField,
  ViewSpec,
} from "@castkit/sdk/plugin"

export type { SettingField, ViewSpec }
export type Settings = Record<string, unknown>
export type Source = SourceDefinition & {
  configuredSecrets?: string[]
}
export type Channel = ChannelDefinition
export type View = ViewDefinition
export type Screen = ScreenDefinition
export type Panel = ViewPanel
export type Adapter = AdapterDefinition
export type Platform = {
  presets: CompositionPreset[]
  deviceScreens: Record<string, string>
  sources: Source[]
  channels: Channel[]
  views: View[]
  screens: Screen[]
  plugins: {
    id: string
    name: string
    version: string
    isEnabled?: boolean
    description?: string
  }[]
  adapters: Adapter[]
  viewSpecs: ViewSpec[]
  channelStates: Record<
    string,
    {
      status?: string
      updatedAt?: string | number
      data?: unknown
      error?: string
    }
  >
}
export type Collection =
  | "sources"
  | "channels"
  | "views"
  | "screens"
export type Definition = Source | Channel | View | Screen
export const inputClass =
  "w-full rounded-md border border-border-default bg-surface-base px-3 py-2 text-content-primary"
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}
export const api = async <T>(
  path: string,
  init?: RequestInit,
): Promise<T> => {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok)
    throw new ApiError(
      body.error ?? `Request failed (${response.status}).`,
      response.status,
    )
  return body as T
}
export const mutate = <T>(
  path: string,
  body: unknown,
  method = "POST",
) => api<T>(path, { method, body: JSON.stringify(body) })
export const initialSettings = (
  fields: SettingField[] = [],
) =>
  Object.fromEntries(
    fields
      .filter((field) => field.defaultValue !== undefined)
      .map((field) => [field.key, field.defaultValue]),
  )
