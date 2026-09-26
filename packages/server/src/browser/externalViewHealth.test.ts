import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http"
import type { AddressInfo } from "node:net"
import {
  afterEach,
  describe,
  expect,
  test,
  vi,
} from "vitest"
import {
  createExternalViewHealth,
  type ExternalViewHealth,
} from "./externalViewHealth.ts"

/**
 * The probe against a real local HTTP server, so a status code, a refused
 * connection and a hung request are the real thing rather than a stub.
 */

const cleanups: (() => Promise<void> | void)[] = []

afterEach(async () => {
  await Promise.all(
    cleanups.splice(0).map((cleanup) => cleanup()),
  )
})

const startFixtureApp = async (
  handler: (
    request: IncomingMessage,
    response: ServerResponse,
  ) => void,
) => {
  const server: Server = createServer(handler)
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve)
  })
  cleanups.push(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  )
  const { port } = server.address() as AddressInfo
  return `http://127.0.0.1:${port}/health`
}

/** A fixture app whose health status a test can change between probes. */
const startSwitchableApp = async (
  initialStatus: number,
) => {
  const current = { status: initialStatus }
  const healthUrl = await startFixtureApp(
    (_request, response) => {
      response.writeHead(current.status)
      response.end(String(current.status))
    },
  )
  return {
    healthUrl,
    setStatus: (status: number) => {
      current.status = status
    },
  }
}

const createProbe = (
  options: Omit<
    Parameters<typeof createExternalViewHealth>[0],
    "onAvailabilityChange"
  >,
) => {
  const changes: {
    healthUrl: string
    isAvailable: boolean
  }[] = []
  const health: ExternalViewHealth =
    createExternalViewHealth({
      ...options,
      onAvailabilityChange: (change) => {
        changes.push(change)
      },
    })
  cleanups.push(() => health.stop())
  return { health, changes }
}

describe("one probe", () => {
  test("marks a 2xx answer available", async () => {
    const { healthUrl } = await startSwitchableApp(204)
    const { health } = createProbe({
      healthUrls: [healthUrl],
    })

    await health.probeAll()

    expect(health.getIsAvailable(healthUrl)).toBe(true)
  })

  test("marks a 502 answer not available", async () => {
    const { healthUrl } = await startSwitchableApp(502)
    const { health, changes } = createProbe({
      healthUrls: [healthUrl],
    })

    await health.probeAll()

    expect(health.getIsAvailable(healthUrl)).toBe(false)
    expect(changes).toEqual([])
  })

  test("marks a refused connection not available", async () => {
    const { healthUrl } = await startSwitchableApp(200)
    const { health } = createProbe({
      healthUrls: [healthUrl],
    })
    await health.probeAll()
    expect(health.getIsAvailable(healthUrl)).toBe(true)

    // The app's server is the first cleanup; closing it now leaves nothing
    // listening on the port, so the next connection is refused.
    await cleanups.splice(0, 1)[0]?.()
    await health.probeAll()

    expect(health.getIsAvailable(healthUrl)).toBe(false)
  })

  test("marks an app that does not answer in time not available", async () => {
    const healthUrl = await startFixtureApp(() => {
      // Never answers.
    })
    const { health } = createProbe({
      healthUrls: [healthUrl],
      timeoutMs: 50,
    })

    await health.probeAll()

    expect(health.getIsAvailable(healthUrl)).toBe(false)
  })

  test("reports a URL it was never given as not available", () => {
    const { health } = createProbe({ healthUrls: [] })

    expect(
      health.getIsAvailable("https://example.com/health"),
    ).toBe(false)
  })
})

describe("change detection", () => {
  test("reports a change only when the answer differs from the last one", async () => {
    const { healthUrl, setStatus } =
      await startSwitchableApp(502)
    const { health, changes } = createProbe({
      healthUrls: [healthUrl],
    })

    await health.probeAll()
    setStatus(200)
    await health.probeAll()
    await health.probeAll()
    setStatus(503)
    await health.probeAll()
    await health.probeAll()

    expect(changes).toEqual([
      { healthUrl, isAvailable: true },
      { healthUrl, isAvailable: false },
    ])
  })

  test("probes a URL shared by two views once per round", async () => {
    const requestCount = { value: 0 }
    const healthUrl = await startFixtureApp(
      (_request, response) => {
        requestCount.value += 1
        response.writeHead(200)
        response.end()
      },
    )
    const { health, changes } = createProbe({
      healthUrls: [healthUrl, healthUrl],
    })

    await health.probeAll()

    expect(requestCount.value).toBe(1)
    expect(changes).toEqual([
      { healthUrl, isAvailable: true },
    ])
  })
})

describe("the cadence", () => {
  test("probes at once on start and again every interval", async () => {
    const { healthUrl, setStatus } =
      await startSwitchableApp(200)
    const { health, changes } = createProbe({
      healthUrls: [healthUrl],
      intervalMs: 20,
    })

    await health.start()
    expect(changes).toEqual([
      { healthUrl, isAvailable: true },
    ])

    setStatus(502)
    await vi.waitFor(() => {
      expect(changes).toEqual([
        { healthUrl, isAvailable: true },
        { healthUrl, isAvailable: false },
      ])
    })
  })

  test("stops probing after stop", async () => {
    const requestCount = { value: 0 }
    const healthUrl = await startFixtureApp(
      (_request, response) => {
        requestCount.value += 1
        response.writeHead(200)
        response.end()
      },
    )
    const { health } = createProbe({
      healthUrls: [healthUrl],
      intervalMs: 10,
    })

    await health.start()
    health.stop()
    const countAtStop = requestCount.value
    await new Promise((resolve) => {
      setTimeout(resolve, 60)
    })

    expect(requestCount.value).toBe(countAtStop)
  })
})
