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
  subscribeAsync = vi.fn(
    async (_subscriptions: object) => {},
  )
  endAsync = vi.fn(async () => {})
}

const fakeClient = new FakeClient()

const connectAsync = vi.fn(async () => fakeClient)

vi.mock("mqtt", () => ({
  default: {
    connectAsync: (...args: unknown[]) =>
      connectAsync(...(args as [])),
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
  fakeClient.subscribeAsync.mockReset()
  fakeClient.subscribeAsync.mockImplementation(
    async () => {},
  )
  connectAsync.mockClear()
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

test("a repeat subscription is sent again so the broker re-sends retained values", async () => {
  const publisher = await buildPublisher()
  await publisher.subscribe({
    topics: ["points/state/+", "points/resp/scan"],
    handler: () => {},
  })
  expect(fakeClient.subscribeAsync).toHaveBeenCalledWith({
    "points/state/+": { qos: 1 },
    "points/resp/scan": { qos: 1 },
    resubscribe: true,
  })
  await publisher.close()
})

/** The topics of each SUBSCRIBE sent since the last `mockClear`, one array per packet. */
const getSubscribedPackets = () =>
  fakeClient.subscribeAsync.mock.calls.map((call) =>
    Object.keys(call[0]).filter(
      (key) => key !== "resubscribe",
    ),
  )

/** Lets the reconnect handler's subscriptions settle. */
const flushReconnect = () =>
  new Promise((resolve) => setImmediate(resolve))

test("mqtt.js's own resubscribe is off, because this wrapper owns it", async () => {
  const publisher = await buildPublisher()
  expect(connectAsync).toHaveBeenCalledWith(
    "mqtt://broker.example:1883",
    expect.objectContaining({ resubscribe: false }),
  )
  await publisher.close()
})

test("a reconnect resubscribes every topic, each in its own packet", async () => {
  const publisher = await buildPublisher()
  await publisher.subscribe({
    topics: ["points/state/+", "points/resp/scan"],
    handler: () => {},
  })
  await publisher.subscribe({
    topics: ["ai-usage/state"],
    handler: () => {},
  })
  fakeClient.subscribeAsync.mockClear()
  fakeClient.emit("connect")
  await flushReconnect()
  /*
   * One packet per topic: a broker that refuses one topic in a packet makes
   * mqtt.js forget every topic in it, so a shared packet would let one
   * refusal take the rest down with it.
   */
  expect(getSubscribedPackets()).toEqual([
    ["points/state/+"],
    ["points/resp/scan"],
    ["ai-usage/state"],
  ])
  await publisher.close()
})

test("a refused topic on reconnect costs only that topic and is retried next time", async () => {
  const publisher = await buildPublisher()
  const consoleError = vi
    .spyOn(console, "error")
    .mockImplementation(() => {})
  await publisher.subscribe({
    topics: ["points/ledger", "ai-usage/state"],
    handler: () => {},
  })
  fakeClient.subscribeAsync.mockImplementation(
    async (subscriptions) => {
      if (Object.hasOwn(subscriptions, "points/ledger")) {
        throw new Error(
          "Subscribe error: Unspecified error",
        )
      }
    },
  )
  fakeClient.subscribeAsync.mockClear()
  fakeClient.emit("connect")
  await flushReconnect()
  expect(getSubscribedPackets()).toEqual([
    ["points/ledger"],
    ["ai-usage/state"],
  ])
  expect(consoleError).toHaveBeenCalledWith(
    "[mqtt] resubscribing to points/ledger failed",
    expect.any(Error),
  )
  fakeClient.subscribeAsync.mockClear()
  fakeClient.emit("connect")
  await flushReconnect()
  expect(getSubscribedPackets()).toEqual([
    ["points/ledger"],
    ["ai-usage/state"],
  ])
  await publisher.close()
})

test("a topic refused at first subscription is still retried after a reconnect", async () => {
  const publisher = await buildPublisher()
  fakeClient.subscribeAsync.mockRejectedValueOnce(
    new Error("Subscribe error: Unspecified error"),
  )
  await expect(
    publisher.subscribe({
      topics: ["points/ledger"],
      handler: () => {},
    }),
  ).rejects.toThrow("Subscribe error")
  fakeClient.subscribeAsync.mockClear()
  fakeClient.emit("connect")
  await flushReconnect()
  expect(getSubscribedPackets()).toEqual([
    ["points/ledger"],
  ])
  await publisher.close()
})

test("a handler that rejects is logged and the other handlers still run", async () => {
  const publisher = await buildPublisher()
  const consoleError = vi
    .spyOn(console, "error")
    .mockImplementation(() => {})
  const failure = new Error("render failed")
  const failing = vi.fn(async () => {
    throw failure
  })
  const healthy = vi.fn()
  await publisher.subscribe({
    topics: ["castkit/a/#"],
    handler: failing,
  })
  await publisher.subscribe({
    topics: ["castkit/a/#"],
    handler: healthy,
  })
  fakeClient.emit(
    "message",
    "castkit/a/view/set",
    Buffer.from("Clock"),
  )
  await flushReconnect()
  expect(healthy).toHaveBeenCalledTimes(1)
  expect(consoleError).toHaveBeenCalledWith(
    "[mqtt] handler for castkit/a/view/set failed",
    failure,
  )
  await publisher.close()
})

test("a handler that throws synchronously cannot break the message listener", async () => {
  const publisher = await buildPublisher()
  const consoleError = vi
    .spyOn(console, "error")
    .mockImplementation(() => {})
  const failure = new Error("bad payload")
  const healthy = vi.fn()
  await publisher.subscribe({
    topics: ["castkit/a/#"],
    handler: () => {
      throw failure
    },
  })
  await publisher.subscribe({
    topics: ["castkit/a/#"],
    handler: healthy,
  })
  expect(() =>
    fakeClient.emit(
      "message",
      "castkit/a/view/set",
      Buffer.from("Clock"),
    ),
  ).not.toThrow()
  // The handlers start synchronously, so the next one has already run.
  expect(healthy).toHaveBeenCalledTimes(1)
  await flushReconnect()
  expect(consoleError).toHaveBeenCalledWith(
    "[mqtt] handler for castkit/a/view/set failed",
    failure,
  )
  await publisher.close()
})
