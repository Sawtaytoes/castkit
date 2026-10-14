import { Socket } from "node:net"
import type { NetworkInterfaceInfo } from "node:os"
import { z } from "zod"

/**
 * The ports a scan tries on every address: 8788 is CastKit's own default, and
 * 8789 is the next one up, where an install whose host already uses 8788
 * usually publishes it. A server on any other port is still one typed address
 * away.
 */
export const scanPorts = [8788, 8789]

/** Names a CastKit host commonly answers to, tried before the sweep. */
const wellKnownHosts = ["castkit.local", "castkit"]

const connectTimeout = 400
const identityTimeout = 2000
const concurrency = 128

const identitySchema = z.object({
  product: z.literal("castkit"),
  publicUrl: z.string().nullable().catch(null),
})

/** A CastKit server a scan found. */
export type FoundServer = {
  /** The address the app should use: the public one when it answers, else the one found. */
  origin: string
  /** Where the scan found it on this network. */
  networkOrigin: string
}

/**
 * The /24 networks to sweep, one per IPv4 interface that is up and not
 * loopback or link-local, as their first three octets. A wider network is
 * still swept only around this computer's own address: 254 hosts is a few
 * seconds, a /16 would be minutes.
 */
export const listScanNetworks = (
  interfaces: Record<
    string,
    NetworkInterfaceInfo[] | undefined
  >,
) => [
  ...new Set(
    Object.values(interfaces)
      .flatMap((addresses) => addresses ?? [])
      .filter(
        (address) =>
          address.family === "IPv4" &&
          !address.internal &&
          !address.address.startsWith("169.254."),
      )
      .map((address) =>
        address.address.split(".").slice(0, 3).join("."),
      ),
  ),
]

/** Every address a scan of these networks tries, well-known names first. */
export const listScanOrigins = (networks: string[]) => [
  ...wellKnownHosts.flatMap((host) =>
    scanPorts.map((port) => `http://${host}:${port}`),
  ),
  ...networks.flatMap((network) =>
    Array.from({ length: 254 }, (_, index) =>
      scanPorts.map(
        (port) => `http://${network}.${index + 1}:${port}`,
      ),
    ).flat(),
  ),
]

/** Whether a TCP port accepts a connection, so closed ports cost no HTTP request. */
export const probePort = ({
  host,
  port,
}: {
  host: string
  port: number
}) =>
  new Promise<boolean>((resolve) => {
    const socket = new Socket()
    const finish = (isOpen: boolean) => {
      socket.destroy()
      resolve(isOpen)
    }
    socket.setTimeout(connectTimeout)
    socket.once("connect", () => finish(true))
    socket.once("timeout", () => finish(false))
    socket.once("error", () => finish(false))
    socket.connect(port, host)
  })

/** Ask an address whether it is a CastKit server, and for its public address. */
export const readIdentity = async (origin: string) => {
  try {
    const response = await fetch(`${origin}/api/identity`, {
      signal: AbortSignal.timeout(identityTimeout),
    })
    if (!response.ok) {
      return null
    }
    const parsed = identitySchema.safeParse(
      await response.json(),
    )
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** Run `work` over `items`, at most `limit` at once, keeping the answers in order. */
const mapWithLimit = async <Item, Result>({
  items,
  limit,
  work,
}: {
  items: Item[]
  limit: number
  work: (item: Item) => Promise<Result>
}) => {
  const cursor = { next: 0 }
  const runWorker = async (
    collected: [number, Result][],
  ): Promise<[number, Result][]> => {
    const index = cursor.next
    cursor.next += 1
    const item = items[index]
    if (index >= items.length || item === undefined) {
      return collected
    }
    return runWorker([
      ...collected,
      [index, await work(item)],
    ])
  }
  const finished = await Promise.all(
    Array.from(
      { length: Math.min(limit, items.length) },
      () => runWorker([]),
    ),
  )
  return finished
    .flat()
    .toSorted(([first], [second]) => first - second)
    .map(([, result]) => result)
}

/**
 * Find the CastKit servers this computer can reach: try each address's port,
 * ask the open ones who they are, and use a server's public address when it
 * has one that answers from here. Two addresses of one server are one result.
 */
export const findServers = async ({
  origins,
  isPortOpen = probePort,
  identify = readIdentity,
}: {
  origins: string[]
  isPortOpen?: typeof probePort
  identify?: typeof readIdentity
}): Promise<FoundServer[]> => {
  const answers = await mapWithLimit({
    items: origins,
    limit: concurrency,
    work: async (origin) => {
      const { hostname, port } = new URL(origin)
      if (
        !(await isPortOpen({
          host: hostname,
          port: Number(port),
        }))
      ) {
        return null
      }
      const identity = await identify(origin)
      if (!identity) {
        return null
      }
      const publicOrigin = identity.publicUrl
        ? new URL(identity.publicUrl).origin
        : null
      const isPublicReachable =
        publicOrigin !== null &&
        (await identify(publicOrigin)) !== null
      return {
        origin: isPublicReachable ? publicOrigin : origin,
        networkOrigin: origin,
      }
    },
  })
  const found = answers.filter((answer) => answer !== null)
  return found.filter(
    (server, index) =>
      found.findIndex(
        (other) => other.origin === server.origin,
      ) === index,
  )
}
