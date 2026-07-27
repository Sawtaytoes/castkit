import { IMPRESSION_DEVICE } from "@castkit/core/devices/device"
import { describe, expect, test } from "vitest"
import { createPushController } from "./pushController.ts"
import { createDeviceConfigStore } from "./state/deviceConfigStore.ts"

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])

/**
 * A push controller wired to the REAL device config store (the thing under
 * test) and thin fakes for everything else, recording what reached MQTT.
 */
const makeController = () => {
  const deviceConfigStore = createDeviceConfigStore()
  const publishedTopics: string[] = []

  const pushController = createPushController({
    devices: [IMPRESSION_DEVICE] as never,
    deviceStore: {
      getActiveView: () => "Clock",
      setActiveView: () => {},
    } as never,
    deviceConfigStore,
    viewDataStore: {
      getNowPlaying: () => undefined,
      getPhotoFrame: () => undefined,
      getWeather: () => undefined,
      getAgenda: () => undefined,
    } as never,
    renderService: {
      renderDevice: async () => PNG,
    } as never,
    publisher: {
      publish: async ({ topic }: { topic: string }) => {
        publishedTopics.push(topic)
      },
    } as never,
    baseTopic: "castkit",
    resolvePhotoEncoding: () =>
      ({ format: "png" }) as never,
    resolveClockConfig: () =>
      ({
        timeZone: "America/Chicago",
        isTwelveHour: true,
        isNumericDate: false,
      }) as never,
    renderTokenStore: {
      createToken: () => "token",
    } as never,
    publicUrl: "",
  })

  return {
    pushController,
    deviceConfigStore,
    publishedTopics,
  }
}

describe("pushDevice — the Updates pause switch", () => {
  test("publishes normally when updates were never configured", async () => {
    const { pushController, publishedTopics } =
      makeController()

    expect(
      await pushController.pushDevice(IMPRESSION_DEVICE.id),
    ).toBe(true)
    // Default must be "enabled" so an install that never touches the switch
    // behaves exactly as it did before the switch existed.
    expect(publishedTopics).toContain(
      `castkit/${IMPRESSION_DEVICE.id}/image`,
    )
  })

  test("publishes nothing while paused", async () => {
    const {
      pushController,
      deviceConfigStore,
      publishedTopics,
    } = makeController()
    deviceConfigStore.setIsUpdatesEnabled({
      deviceId: IMPRESSION_DEVICE.id,
      isEnabled: false,
    })

    expect(
      await pushController.pushDevice(IMPRESSION_DEVICE.id),
    ).toBe(false)
    // Not one topic — the panel must hold its last frame on glass.
    expect(publishedTopics).toEqual([])
  })

  test("a view change while paused stays off the panel", async () => {
    const {
      pushController,
      deviceConfigStore,
      publishedTopics,
    } = makeController()
    deviceConfigStore.setIsUpdatesEnabled({
      deviceId: IMPRESSION_DEVICE.id,
      isEnabled: false,
    })

    expect(
      await pushController.setView({
        deviceId: IMPRESSION_DEVICE.id,
        viewName: "Agenda",
      }),
    ).toBe(false)
    expect(publishedTopics).toEqual([])
  })

  test("resuming publishes again", async () => {
    const {
      pushController,
      deviceConfigStore,
      publishedTopics,
    } = makeController()
    deviceConfigStore.setIsUpdatesEnabled({
      deviceId: IMPRESSION_DEVICE.id,
      isEnabled: false,
    })
    await pushController.pushDevice(IMPRESSION_DEVICE.id)
    deviceConfigStore.setIsUpdatesEnabled({
      deviceId: IMPRESSION_DEVICE.id,
      isEnabled: true,
    })

    expect(
      await pushController.pushDevice(IMPRESSION_DEVICE.id),
    ).toBe(true)
    expect(publishedTopics).toContain(
      `castkit/${IMPRESSION_DEVICE.id}/image`,
    )
  })
})

describe("deviceConfigStore — updates-enabled semantics", () => {
  test("defaults to enabled, and reports no value until set", () => {
    const store = createDeviceConfigStore()

    expect(store.getIsUpdatesEnabled("eink-test")).toBe(
      true,
    )
    // getHasValue gates the boot-time restore from the retained topic — it must
    // be false until something actually set it, or a restore would be skipped.
    expect(
      store.getHasUpdatesEnabledValue("eink-test"),
    ).toBe(false)

    store.setIsUpdatesEnabled({
      deviceId: "eink-test",
      isEnabled: false,
    })
    expect(store.getIsUpdatesEnabled("eink-test")).toBe(
      false,
    )
    expect(
      store.getHasUpdatesEnabledValue("eink-test"),
    ).toBe(true)
  })

  test("pausing one device does not pause another", () => {
    const store = createDeviceConfigStore()
    store.setIsUpdatesEnabled({
      deviceId: "eink-kitchen",
      isEnabled: false,
    })

    expect(store.getIsUpdatesEnabled("eink-kitchen")).toBe(
      false,
    )
    expect(store.getIsUpdatesEnabled("eink-office")).toBe(
      true,
    )
  })
})
