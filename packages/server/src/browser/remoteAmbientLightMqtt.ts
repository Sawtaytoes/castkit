import {
  AMBIENT_LIGHT_MODES,
  ambientLightViewModesSchema,
} from "@castkit/sdk/ambientLight"
import type { MqttPublisher } from "@castkit/shared/mqtt/publisher"
import { z } from "zod"
import { buildBrowserDeviceTopics } from "../homeAssistant/browserDiscovery.ts"
import type { createRemoteAmbientLight } from "./remoteAmbientLight.ts"

const commandSchema = z
  .object({
    state: z.enum(["ON", "OFF"]).optional(),
    brightness: z.number().int().min(0).max(100).optional(),
    effect: z
      .enum([...AMBIENT_LIGHT_MODES, "follow-view"])
      .optional(),
    demo: z.boolean().optional(),
    followView: z.boolean().optional(),
    viewModes: ambientLightViewModesSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0)
/** Optional standard JSON MQTT light, mirroring the native persisted controller. */
export const createRemoteAmbientLightMqtt = ({
  controller,
  publisher,
  baseTopic,
}: {
  controller: ReturnType<typeof createRemoteAmbientLight>
  publisher: MqttPublisher
  baseTopic: string
}) => {
  const publishedState = new Map<string, string>()
  const publish = async ({
    deviceId,
    isForced = false,
  }: {
    deviceId: string
    isForced?: boolean
  }) => {
    if (!publisher.isEnabled) return
    const settings = controller.get(deviceId)
    const resolved = controller.resolve(deviceId)
    const payload = JSON.stringify({
      state:
        resolved.isOn && settings.brightness > 0
          ? "ON"
          : "OFF",
      brightness: settings.brightness,
      effect: settings.followView
        ? "follow-view"
        : settings.mode,
      demo: settings.demo,
      resolved_effect: resolved.effectiveMode,
      followView: settings.followView,
      viewModes: settings.viewModes,
    })
    if (
      !isForced &&
      publishedState.get(deviceId) === payload
    )
      return
    publishedState.set(deviceId, payload)
    await publisher
      .publish({
        topic: buildBrowserDeviceTopics({
          baseTopic,
          deviceId,
        }).ambientLightState,
        payload,
        isRetained: true,
      })
      .catch((error) => {
        if (publishedState.get(deviceId) === payload)
          publishedState.delete(deviceId)
        throw error
      })
  }
  const command = ({
    deviceId,
    payload,
  }: {
    deviceId: string
    payload: string
  }) => {
    const parsed = (() => {
      try {
        return commandSchema.safeParse(JSON.parse(payload))
      } catch {
        return null
      }
    })()
    if (!parsed?.success) return false
    const value = parsed.data
    return controller.update({
      deviceId,
      updates: {
        ...(value.brightness === 0
          ? { isOn: false }
          : value.state
            ? { isOn: value.state === "ON" }
            : value.brightness !== undefined
              ? { isOn: value.brightness > 0 }
              : {}),
        ...(value.brightness !== undefined &&
        value.brightness > 0
          ? { brightness: value.brightness }
          : {}),
        ...(value.effect === "follow-view"
          ? { followView: true }
          : value.effect
            ? { mode: value.effect, followView: false }
            : value.followView !== undefined
              ? { followView: value.followView }
              : {}),
        ...(value.viewModes
          ? { viewModes: value.viewModes }
          : {}),
        ...(value.demo !== undefined
          ? { demo: value.demo }
          : {}),
      },
    })
  }
  return { publish, command }
}
