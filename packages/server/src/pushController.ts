import type { DeviceMetadata } from "@inkcast/core/devices/device"
import { buildDeviceTopics } from "./ha/discovery.ts"
import type { MqttPublisher } from "./mqtt/publisher.ts"
import type { RenderService } from "./render/renderService.ts"
import type { DeviceStore } from "./state/deviceStore.ts"
import type { ViewName } from "./views/registry.ts"

/**
 * The single place that renders a device's current view and pushes it to MQTT
 * (image + view-state + last-render timestamp). Shared by the HTTP API and the
 * MQTT command handler so both paths behave identically. When MQTT is disabled
 * the publish calls no-op, so `renderDeviceImage` (the HTTP GET) still works.
 */
export type PushController = {
  deviceById: Map<string, DeviceMetadata>
  renderDevice: (deviceId: string) => Promise<Buffer | null>
  pushDevice: (deviceId: string) => Promise<boolean>
  setView: (params: {
    deviceId: string
    viewName: ViewName
  }) => Promise<boolean>
}

export const createPushController = ({
  devices,
  deviceStore,
  renderService,
  publisher,
  baseTopic,
}: {
  devices: readonly DeviceMetadata[]
  deviceStore: DeviceStore
  renderService: RenderService
  publisher: MqttPublisher
  baseTopic: string
}): PushController => {
  const deviceById = new Map(
    devices.map((device) => [device.id, device]),
  )

  const renderDevice = async (deviceId: string) => {
    const device = deviceById.get(deviceId)
    if (!device) {
      return null
    }

    return renderService.renderDevice({
      device,
      viewName: deviceStore.getActiveView(deviceId),
    })
  }

  const pushDevice = async (deviceId: string) => {
    const device = deviceById.get(deviceId)
    if (!device) {
      return false
    }

    const image = await renderService.renderDevice({
      device,
      viewName: deviceStore.getActiveView(deviceId),
    })
    const topics = buildDeviceTopics({ baseTopic, device })

    await publisher.publish({
      topic: topics.image,
      payload: image,
      isRetained: true,
    })
    await publisher.publish({
      topic: topics.viewState,
      payload: deviceStore.getActiveView(deviceId),
      isRetained: true,
    })
    await publisher.publish({
      topic: topics.lastRender,
      payload: new Date().toISOString(),
      isRetained: true,
    })

    return true
  }

  const setView = async ({
    deviceId,
    viewName,
  }: {
    deviceId: string
    viewName: ViewName
  }) => {
    if (!deviceById.has(deviceId)) {
      return false
    }

    deviceStore.setActiveView({ deviceId, viewName })
    return pushDevice(deviceId)
  }

  return { deviceById, renderDevice, pushDevice, setView }
}
