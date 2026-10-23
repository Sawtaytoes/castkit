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
const makeController = ({
  activeView = "Clock",
  imageDelivery,
  renderOn,
  publicUrl = "",
  photoEncoding = { format: "png" },
  onRender,
  renderPlatform,
  getRequestFrameKey,
}: {
  getRequestFrameKey?: (
    deviceId: string,
  ) => string | undefined
  activeView?: string
  imageDelivery?: "mqtt-image" | "http-pull"
  renderOn?: "update" | "request"
  publicUrl?: string
  photoEncoding?: { format: string; quality?: number }
  /**
   * Runs INSIDE the fake render, so a test can do what Home Assistant's
   * retained state does on a restart: arrive while the render is in flight.
   */
  renderPlatform?: Parameters<
    typeof createPushController
  >[0]["renderPlatform"]
  onRender?: () => Promise<void> | void
} = {}) => {
  const deviceConfigStore = createDeviceConfigStore()
  const publishedTopics: string[] = []
  const publishedPayloads: {
    topic: string
    payload: unknown
  }[] = []
  const renderedEncodings: unknown[] = []
  const renderedViews: unknown[] = []
  const currentView = { value: activeView }

  const device = {
    ...IMPRESSION_DEVICE,
    ...(imageDelivery ? { imageDelivery } : {}),
    ...(renderOn ? { renderOn } : {}),
  }

  const pushController = createPushController({
    renderPlatform,
    getRequestFrameKey,
    devices: [device] as never,
    deviceStore: {
      getActiveView: () => currentView.value,
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
      renderDevice: async ({
        fullColorEncoding,
        viewName,
      }: {
        fullColorEncoding: unknown
        viewName: unknown
      }) => {
        renderedEncodings.push(fullColorEncoding)
        renderedViews.push(viewName)
        await onRender?.()
        return PNG
      },
    } as never,
    publisher: {
      publish: async ({
        topic,
        payload,
      }: {
        topic: string
        payload: unknown
      }) => {
        publishedTopics.push(topic)
        publishedPayloads.push({ topic, payload })
      },
    } as never,
    baseTopic: "castkit",
    resolvePhotoEncoding: () => photoEncoding as never,
    resolveClockConfig: () =>
      ({
        timeZone: "America/Chicago",
        isTwelveHour: true,
        isNumericDate: false,
      }) as never,
    renderTokenStore: {
      createToken: () => "token",
    } as never,
    publicUrl,
  })

  return {
    pushController,
    deviceConfigStore,
    publishedTopics,
    publishedPayloads,
    renderedEncodings,
    renderedViews,
    currentView,
  }
}

describe("pushDevice — 'http-pull' panels are locked to PNG", () => {
  test("an explicit refresh delivers unchanged bytes after a client loses its image", async () => {
    const {
      pushController,
      publishedTopics,
      deviceConfigStore,
    } = makeController({
      imageDelivery: "http-pull",
      publicUrl: "https://display.example.com",
    })
    await pushController.pushDevice(IMPRESSION_DEVICE.id)
    await pushController.pushDevice(IMPRESSION_DEVICE.id)
    expect(
      publishedTopics.filter((topic) =>
        topic.endsWith("/image_url"),
      ),
    ).toHaveLength(1)
    await pushController.pushDevice(IMPRESSION_DEVICE.id, {
      isForced: true,
    })
    expect(
      publishedTopics.filter((topic) =>
        topic.endsWith("/image_url"),
      ),
    ).toHaveLength(2)
    deviceConfigStore.setIsUpdatesEnabled({
      deviceId: IMPRESSION_DEVICE.id,
      isEnabled: false,
    })
    await pushController.pushDevice(IMPRESSION_DEVICE.id, {
      isForced: true,
    })
    expect(
      publishedTopics.filter((topic) =>
        topic.endsWith("/image_url"),
      ),
    ).toHaveLength(2)
  })
  // An ESPHome `online_image` picks its decoder at COMPILE time, so a JPEG or
  // WebP frame is not "lower quality" to it — it is undecodable ("Incorrect PNG
  // signature") and the panel silently keeps its last frame. This bit the
  // M5Paper for real: photo_format sat on "Auto", inherited the global JPEG
  // default meant for the ARMv6 Pi, and the panel went blank.
  test("a photo view still renders PNG despite a lossy photo encoding", async () => {
    const { pushController, renderedEncodings } =
      makeController({
        activeView: "Photo Frame",
        imageDelivery: "http-pull",
        photoEncoding: { format: "jpeg", quality: 80 },
      })

    await pushController.pushDevice(IMPRESSION_DEVICE.id)

    expect(renderedEncodings).toEqual([{ format: "png" }])
  })

  test("an mqtt-image panel on the same view still gets the lossy encoding", async () => {
    // The guard must be scoped to the delivery mechanism — the Pi fleet decodes
    // with PIL and genuinely wants the ~10x smaller JPEG.
    const { pushController, renderedEncodings } =
      makeController({
        activeView: "Photo Frame",
        imageDelivery: "mqtt-image",
        photoEncoding: { format: "jpeg", quality: 80 },
      })

    await pushController.pushDevice(IMPRESSION_DEVICE.id)

    expect(renderedEncodings).toEqual([
      { format: "jpeg", quality: 80 },
    ])
  })
})

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

/**
 * A render takes seconds — 15 s for five cold Chromium panels on the last
 * deploy — and Home Assistant's retained `updates` and `view` land inside that
 * window on every restart. Checking only before the render is what published a
 * frame to two displays the owner had paused; they then held that wrong frame,
 * because a paused display is never pushed to again.
 */
describe("pushDevice — state that changes DURING the render", () => {
  test("a pause that lands mid-render drops the frame", async () => {
    const {
      pushController,
      deviceConfigStore,
      publishedTopics,
    } = makeController({
      onRender: () => {
        deviceConfigStore.setIsUpdatesEnabled({
          deviceId: IMPRESSION_DEVICE.id,
          isEnabled: false,
        })
      },
    })

    const isPushed = await pushController.pushDevice(
      IMPRESSION_DEVICE.id,
    )

    expect(isPushed).toBe(false)
    expect(publishedTopics).toEqual([])
  })

  test("a view switch mid-render drops the now-stale frame", async () => {
    // Whatever changed the view has queued its own push, so this frame is
    // stale rather than late. Publishing it would also leave the retained
    // `view` topic disagreeing with the retained image bytes.
    const { pushController, publishedTopics, currentView } =
      makeController({
        activeView: "Clock",
        onRender: () => {
          currentView.value = "Agenda"
        },
      })

    const isPushed = await pushController.pushDevice(
      IMPRESSION_DEVICE.id,
    )

    expect(isPushed).toBe(false)
    expect(publishedTopics).toEqual([])
  })

  test("an unchanged device still publishes normally", async () => {
    const { pushController, publishedTopics } =
      makeController()

    const isPushed = await pushController.pushDevice(
      IMPRESSION_DEVICE.id,
    )

    expect(isPushed).toBe(true)
    expect(publishedTopics.length).toBeGreaterThan(0)
  })

  test("the rendered view is the one published, not a later one", async () => {
    // The bug this pins: the view was read once for the render and AGAIN for
    // the log line and the `view` topic, so a switch mid-render made the
    // published name describe bytes that were never rendered.
    const {
      pushController,
      publishedPayloads,
      renderedViews,
    } = makeController({ activeView: "Clock" })

    await pushController.pushDevice(IMPRESSION_DEVICE.id)

    expect(renderedViews).toEqual(["Clock"])
    expect(
      publishedPayloads.find((published) =>
        published.topic.endsWith("/view"),
      )?.payload,
    ).toBe("Clock")
  })
})

test("previews use delivery overrides without changing the selected view or publishing", async () => {
  const captures: Parameters<
    NonNullable<
      Parameters<
        typeof createPushController
      >[0]["renderPlatform"]
    >
  >[0][] = []
  const {
    pushController,
    deviceConfigStore,
    currentView,
    publishedTopics,
  } = makeController({
    renderPlatform: async (settings) => {
      captures.push(settings)
      return PNG
    },
  })
  const deviceId = IMPRESSION_DEVICE.id
  deviceConfigStore.setRotationOverride({
    deviceId,
    rotation: 90,
  })
  deviceConfigStore.setColorModeOverride({
    deviceId,
    colorMode: "bw",
  })
  deviceConfigStore.setDitherAlgorithm({
    deviceId,
    algorithm: "threshold",
  })
  deviceConfigStore.setBrightnessPercent({
    deviceId,
    percent: 125,
  })
  deviceConfigStore.setSaturationPercent({
    deviceId,
    percent: 80,
  })
  deviceConfigStore.setMarginEdge({
    deviceId,
    edge: "left",
    pixels: 10,
  })
  await pushController.renderDevice(deviceId)
  await pushController.renderPreview({
    deviceId,
    kind: "view",
    id: "agenda",
  })
  expect(captures[1]).toEqual({
    ...captures[0],
    target: { kind: "view", id: "agenda" },
  })
  expect(captures[1]?.device).toMatchObject({
    rotation: 90,
    colorMode: "monochrome",
    ditherProfile: { algorithm: "threshold" },
  })
  expect(captures[1]?.adjustments).toEqual({
    brightness: 1.25,
    saturation: 0.8,
  })
  expect(captures[1]?.margin).toMatchObject({ left: 10 })
  expect(currentView.value).toBe("Clock")
  expect(publishedTopics).toEqual([])
})

// The Watchy deep-sleeps and asks for its Points image on `refresh/set` when
// the page wakes. Every other render reached nobody and kept Chromium open.
describe('pushDevice — a renderOn: "request" display', () => {
  const makeWatch = (renderOn?: "update" | "request") =>
    makeController({
      activeView: "Now Playing (Dashboard)",
      imageDelivery: "http-pull",
      renderOn,
      publicUrl: "https://display.example.com",
    })

  test("renders nothing on the minute tick, a data push or a setting change", async () => {
    const {
      pushController,
      publishedTopics,
      renderedViews,
    } = makeWatch("request")

    // The clock ticker, the data topics, the platform scheduler and the knob
    // handlers all call pushDevice with no options.
    expect(
      await pushController.pushDevice(IMPRESSION_DEVICE.id),
    ).toBe(false)
    expect(
      await pushController.pushDevice(
        IMPRESSION_DEVICE.id,
        {
          isForced: true,
        },
      ),
    ).toBe(false)

    expect(renderedViews).toEqual([])
    expect(publishedTopics).toEqual([])
  })

  test("renders and publishes a fresh image URL when the display asks", async () => {
    const { pushController, publishedPayloads } =
      makeWatch("request")

    // The `refresh/set` route passes both: the watch lost its RAM image.
    expect(
      await pushController.pushDevice(
        IMPRESSION_DEVICE.id,
        {
          isForced: true,
          isRequested: true,
        },
      ),
    ).toBe(true)
    expect(
      await pushController.pushDevice(
        IMPRESSION_DEVICE.id,
        {
          isForced: true,
          isRequested: true,
        },
      ),
    ).toBe(true)

    expect(
      publishedPayloads.filter(({ topic }) =>
        topic.endsWith("/image_url"),
      ),
    ).toEqual([
      {
        topic: `castkit/${IMPRESSION_DEVICE.id}/image_url`,
        payload:
          "https://display.example.com/render/token.png",
      },
      {
        topic: `castkit/${IMPRESSION_DEVICE.id}/image_url`,
        payload:
          "https://display.example.com/render/token.png",
      },
    ])
  })

  test("a view select still renders, because it is an explicit action", async () => {
    const { pushController, renderedViews } =
      makeWatch("request")

    expect(
      await pushController.setView({
        deviceId: IMPRESSION_DEVICE.id,
        viewName: "Clock",
      }),
    ).toBe(true)
    // The fake device store ignores the select, so the render reads the
    // view it already held. What matters here is that a render happened.
    expect(renderedViews).toHaveLength(1)
  })

  test("a paused display stays paused even when it asks", async () => {
    const {
      pushController,
      deviceConfigStore,
      renderedViews,
    } = makeWatch("request")
    deviceConfigStore.setIsUpdatesEnabled({
      deviceId: IMPRESSION_DEVICE.id,
      isEnabled: false,
    })

    expect(
      await pushController.pushDevice(
        IMPRESSION_DEVICE.id,
        {
          isRequested: true,
        },
      ),
    ).toBe(false)
    expect(renderedViews).toEqual([])
  })

  test.each([
    ["absent", undefined],
    ['"update"', "update" as const],
  ])("renderOn %s keeps rendering on every push", async (_label, renderOn) => {
    const {
      pushController,
      renderedViews,
      publishedTopics,
    } = makeWatch(renderOn)

    expect(
      await pushController.pushDevice(IMPRESSION_DEVICE.id),
    ).toBe(true)
    expect(renderedViews).toEqual([
      "Now Playing (Dashboard)",
    ])
    expect(publishedTopics).toContain(
      `castkit/${IMPRESSION_DEVICE.id}/image_url`,
    )
  })
})

// The watch's request used to wait for a Chromium capture. The frame is now
// rendered ahead when its content changes and kept in memory, so the request
// is answered from the buffer.
describe('pushDevice — a renderOn: "request" display answers from its frame kept in memory', () => {
  const makeWatchWithPlatform = ({
    frameKey,
  }: {
    frameKey: { value: string | undefined }
  }) => {
    const capture = {
      callCount: 0,
      finish: () => {},
      isManual: false,
    }
    const harness = makeController({
      activeView: "Now Playing (Dashboard)",
      imageDelivery: "http-pull",
      renderOn: "request",
      publicUrl: "https://display.example.com",
      getRequestFrameKey: () => frameKey.value,
      renderPlatform: () => {
        capture.callCount += 1
        return capture.isManual
          ? new Promise<Buffer>((resolve) => {
              capture.finish = () => resolve(PNG)
            })
          : Promise.resolve(PNG)
      },
    })
    return { ...harness, capture }
  }
  const requestFrame = (
    pushController: ReturnType<
      typeof makeController
    >["pushController"],
  ) =>
    pushController.pushDevice(IMPRESSION_DEVICE.id, {
      isForced: true,
      isRequested: true,
    })

  test("a request after the frame was rendered ahead captures nothing", async () => {
    const { pushController, capture, publishedPayloads } =
      makeWatchWithPlatform({
        frameKey: { value: "points-12" },
      })

    expect(
      pushController.getPrerenderKey(IMPRESSION_DEVICE.id),
    ).toBeDefined()
    expect(
      await pushController.prerenderDevice(
        IMPRESSION_DEVICE.id,
      ),
    ).toBe(true)
    expect(capture.callCount).toBe(1)
    expect(
      pushController.getPrerenderKey(IMPRESSION_DEVICE.id),
    ).toBeUndefined()

    expect(await requestFrame(pushController)).toBe(true)
    expect(await requestFrame(pushController)).toBe(true)

    expect(capture.callCount).toBe(1)
    expect(
      publishedPayloads.filter(({ topic }) =>
        topic.endsWith("/image_url"),
      ),
    ).toHaveLength(2)
  })

  test("a request while the frame renders ahead joins that render", async () => {
    const { pushController, capture, publishedTopics } =
      makeWatchWithPlatform({
        frameKey: { value: "points-12" },
      })
    capture.isManual = true

    const preparing = pushController.prerenderDevice(
      IMPRESSION_DEVICE.id,
    )
    const requesting = requestFrame(pushController)
    capture.finish()

    expect(await preparing).toBe(true)
    expect(await requesting).toBe(true)
    expect(capture.callCount).toBe(1)
    expect(publishedTopics).toContain(
      `castkit/${IMPRESSION_DEVICE.id}/image_url`,
    )
  })

  test("content that changed since the frame ahead renders on the request", async () => {
    const frameKey = {
      value: "points-12" as string | undefined,
    }
    const { pushController, capture } =
      makeWatchWithPlatform({ frameKey })

    await pushController.prerenderDevice(
      IMPRESSION_DEVICE.id,
    )
    frameKey.value = "points-13"

    expect(await requestFrame(pushController)).toBe(true)
    expect(capture.callCount).toBe(2)
    // The frame the request rendered is the one kept now.
    expect(await requestFrame(pushController)).toBe(true)
    expect(capture.callCount).toBe(2)
  })

  test("a changed render setting never serves the frame drawn under the old one", async () => {
    const { pushController, capture, deviceConfigStore } =
      makeWatchWithPlatform({
        frameKey: { value: "points-12" },
      })

    await pushController.prerenderDevice(
      IMPRESSION_DEVICE.id,
    )
    deviceConfigStore.setDitherAlgorithm({
      deviceId: IMPRESSION_DEVICE.id,
      algorithm: "atkinson",
    })

    expect(
      pushController.getPrerenderKey(IMPRESSION_DEVICE.id),
    ).toBeDefined()
    expect(await requestFrame(pushController)).toBe(true)
    expect(capture.callCount).toBe(2)
  })

  test("a time-driven view keeps nothing and renders on every request", async () => {
    const { pushController, capture } =
      makeWatchWithPlatform({
        frameKey: { value: undefined },
      })

    expect(
      pushController.getPrerenderKey(IMPRESSION_DEVICE.id),
    ).toBeUndefined()
    expect(
      await pushController.prerenderDevice(
        IMPRESSION_DEVICE.id,
      ),
    ).toBe(false)
    expect(await requestFrame(pushController)).toBe(true)
    expect(await requestFrame(pushController)).toBe(true)
    expect(capture.callCount).toBe(2)
  })

  test("the held frame is dropped once no frame can be kept", async () => {
    const frameKey = {
      value: "points-12" as string | undefined,
    }
    const { pushController, capture } =
      makeWatchWithPlatform({ frameKey })

    await pushController.prerenderDevice(
      IMPRESSION_DEVICE.id,
    )
    // The platform screen was unassigned, then assigned again unchanged.
    frameKey.value = undefined
    expect(
      pushController.getPrerenderKey(IMPRESSION_DEVICE.id),
    ).toBeUndefined()
    frameKey.value = "points-12"

    expect(
      pushController.getPrerenderKey(IMPRESSION_DEVICE.id),
    ).toBeDefined()
    expect(await requestFrame(pushController)).toBe(true)
    expect(capture.callCount).toBe(2)
  })

  test("a paused display renders nothing ahead", async () => {
    const { pushController, capture, deviceConfigStore } =
      makeWatchWithPlatform({
        frameKey: { value: "points-12" },
      })
    deviceConfigStore.setIsUpdatesEnabled({
      deviceId: IMPRESSION_DEVICE.id,
      isEnabled: false,
    })

    expect(
      pushController.getPrerenderKey(IMPRESSION_DEVICE.id),
    ).toBeUndefined()
    expect(
      await pushController.prerenderDevice(
        IMPRESSION_DEVICE.id,
      ),
    ).toBe(false)
    expect(capture.callCount).toBe(0)
  })

  test("a display that renders on every update keeps no frame", async () => {
    const harness = makeController({
      renderOn: "update",
      getRequestFrameKey: () => "points-12",
      renderPlatform: async () => PNG,
    })

    expect(
      harness.pushController.getPrerenderKey(
        IMPRESSION_DEVICE.id,
      ),
    ).toBeUndefined()
    expect(
      await harness.pushController.prerenderDevice(
        IMPRESSION_DEVICE.id,
      ),
    ).toBe(false)
  })
})
