import type { MqttPublisher } from "@castkit/shared/mqtt/publisher"
import { buildBrowserDeviceTopics } from "../homeAssistant/browserDiscovery.ts"
import {
  brightnessToPercent,
  parseBacklightBrightnessPayload,
  parseBacklightPercentPayload,
  percentToBrightness,
} from "./browserBacklightStore.ts"
import type { createRemoteBacklight } from "./remoteBacklight.ts"

/** MQTT mirrors the persisted native controller; state topics are never commands. */
export const createRemoteBacklightMqtt = ({
  controller,
  publisher,
  baseTopic,
}: {
  controller: ReturnType<typeof createRemoteBacklight>
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
    const effective =
      controller.resolve(deviceId).backlight_percent
    const signature = `${settings.level}/${effective > 0}`
    if (
      !isForced &&
      publishedState.get(deviceId) === signature
    )
      return
    const topics = buildBrowserDeviceTopics({
      baseTopic,
      deviceId,
    })
    // Deduplicate while a publish is queued during a broker outage too.
    publishedState.set(deviceId, signature)
    await Promise.all(
      (
        [
          [
            topics.backlightState,
            effective > 0 ? "ON" : "OFF",
          ],
          [
            topics.backlightBrightnessState,
            String(percentToBrightness(settings.level)),
          ],
          [
            topics.backlightLevelState,
            String(settings.level),
          ],
        ] as const
      ).map(([topic, payload]) =>
        publisher.publish({
          topic,
          payload,
          isRetained: true,
        }),
      ),
    ).catch((error) => {
      if (publishedState.get(deviceId) === signature) {
        publishedState.delete(deviceId)
      }
      throw error
    })
  }
  const command = ({
    deviceId,
    kind,
    payload,
  }: {
    deviceId: string
    kind: string
    payload: string
  }) => {
    if (kind === "backlightPower") {
      return (
        ["ON", "OFF"].includes(payload) &&
        controller.set({
          deviceId,
          kind,
          payload: payload.toLowerCase(),
        })
      )
    }
    const percent =
      kind === "backlightBrightness"
        ? (() => {
            const brightness =
              parseBacklightBrightnessPayload(payload)
            return brightness === null
              ? null
              : brightness > 0
                ? Math.max(
                    1,
                    brightnessToPercent(brightness),
                  )
                : 0
          })()
        : kind === "backlightLevel"
          ? parseBacklightPercentPayload(payload)
          : null
    if (percent === null) return false
    // HA light brightness zero turns off while retaining the brightness to restore.
    if (kind === "backlightBrightness") {
      controller.set({
        deviceId,
        kind: "backlightPower",
        payload: percent > 0 ? "on" : "off",
      })
      if (percent === 0) return true
    }
    return controller.set({
      deviceId,
      kind: "backlightLevel",
      payload: String(percent),
    })
  }
  return { publish, command }
}
