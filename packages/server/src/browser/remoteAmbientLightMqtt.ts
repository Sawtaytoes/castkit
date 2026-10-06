import { AMBIENT_LIGHT_MODES } from "@castkit/sdk/ambientLight"
import type { MqttPublisher } from "@castkit/shared/mqtt/publisher"
import { z } from "zod"
import { buildBrowserDeviceTopics } from "../homeAssistant/browserDiscovery.ts"
import type { createRemoteAmbientLight } from "./remoteAmbientLight.ts"

const commandSchema = z
  .object({
    state: z.enum(["ON", "OFF"]).optional(),
    brightness: z.number().int().min(0).max(100).optional(),
    effect: z.enum(AMBIENT_LIGHT_MODES).optional(),
    demo: z.boolean().optional(),
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
    const payload = JSON.stringify({
      state:
        settings.isOn && settings.brightness > 0
          ? "ON"
          : "OFF",
      brightness: settings.brightness,
      effect: settings.mode,
      demo: settings.demo,
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
        ...(value.effect ? { mode: value.effect } : {}),
        ...(value.demo !== undefined
          ? { demo: value.demo }
          : {}),
      },
    })
  }
  return { publish, command }
}
