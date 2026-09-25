import { EventEmitter } from "node:events"
import {
  afterEach,
  beforeEach,
  expect,
  test,
  vi,
} from "vitest"

/**
 * A stand-in for the mqtt.js client that is a real EventEmitter, so
 * `listenerCount` means what it means in production. That count is the whole
 * point of these tests.
 */
class FakeClient extends EventEmitter {
  publishAsync = vi.fn(async () => {})
  subscribeAsync = vi.fn(async () => {})
  endAsync = vi.fn(async () => {})
}

const fakeClient = new FakeClient()

vi.mock("mqtt", () => ({
  default: {
    connectAsync: async () => fakeClient,
  },
}))

const { createMqttPublisher } = await import(
  "./publisher.ts"
)

const buildPublisher = () =>
  createMqttPublisher({
    config: {
      url: "mqtt://broker.example:1883",
      username: "",
      password: "",
      caFile: undefined,
      isRejectUnauthorized: true,
    },
    availabilityTopic: "castkit/bridge/availability",
  })

beforeEach(() => {
  fakeClient.removeAllListeners()
  fakeClient.publishAsync.mockClear()
  fakeClient.subscribeAsync.mockClear()
  vi.spyOn(console, "log").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

test("many subscribers share one message listener", async () => {
  const publisher = await buildPublisher()
  await Promise.all(
    Array.from({ length: 12 }, (_unused, index) =>
      publisher.subscribe({
        topics: [`castkit/source-${index}/#`],
        handler: () => {},
      }),
    ),
  )
  /*
   * One, not twelve. mqtt.js inherits Node's default limit of ten, so a
   * listener per subscriber made the sixth source log a
   * MaxListenersExceededWarning on every boot — and the growth was unbounded.
   */
  expect(fakeClient.listenerCount("message")).toBe(1)
  expect(fakeClient.subscribeAsync).toHaveBeenCalledTimes(
    12,
  )
  await publisher.close()
})

test("every handler still receives every message", async () => {
  // Each subscriber already filtered by topic itself, so one shared listener
  // has to deliver to all of them or the fan-out changes behavior.
  const publisher = await buildPublisher()
  const first = vi.fn()
  const second = vi.fn()
  await publisher.subscribe({
    topics: ["castkit/a/#"],
    handler: first,
  })
  await publisher.subscribe({
    topics: ["castkit/b/#"],
    handler: second,
  })
  fakeClient.emit(
    "message",
    "castkit/a/state",
    Buffer.from("payload"),
  )
  const delivered = {
    topic: "castkit/a/state",
    payload: "payload",
  }
  expect(first).toHaveBeenCalledWith(delivered)
  expect(second).toHaveBeenCalledWith(delivered)
  await publisher.close()
})

test("the same handler registered twice runs once", async () => {
  const publisher = await buildPublisher()
  const handler = vi.fn()
  await publisher.subscribe({
    topics: ["castkit/a/#"],
    handler,
  })
  await publisher.subscribe({
    topics: ["castkit/b/#"],
    handler,
  })
  fakeClient.emit(
    "message",
    "castkit/a/state",
    Buffer.from("payload"),
  )
  expect(handler).toHaveBeenCalledTimes(1)
  await publisher.close()
})

test("a publisher with no broker URL subscribes to nothing", async () => {
  const publisher = await createMqttPublisher({
    config: {
      url: "",
      username: "",
      password: "",
      caFile: undefined,
      isRejectUnauthorized: true,
    },
    availabilityTopic: "castkit/bridge/availability",
  })
  expect(publisher.isEnabled).toBe(false)
  await publisher.subscribe({
    topics: ["castkit/a/#"],
    handler: () => {},
  })
  expect(fakeClient.subscribeAsync).not.toHaveBeenCalled()
})
