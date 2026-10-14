import { describe, expect, test } from "vitest"
import {
  findServers,
  listScanNetworks,
  listScanOrigins,
} from "./serverDiscovery.ts"

describe(listScanNetworks.name, () => {
  test("sweeps each IPv4 network once, skipping loopback, link-local, and IPv6", () => {
    expect(
      listScanNetworks({
        Ethernet: [
          {
            address: "10.1.0.42",
            netmask: "255.255.255.0",
            family: "IPv4",
            mac: "00:00:00:00:00:00",
            internal: false,
            cidr: "10.1.0.42/24",
          },
          {
            address: "fe80::1",
            netmask: "ffff:ffff:ffff:ffff::",
            family: "IPv6",
            mac: "00:00:00:00:00:00",
            internal: false,
            cidr: "fe80::1/64",
            scopeid: 1,
          },
        ],
        "Wi-Fi": [
          {
            address: "10.1.0.77",
            netmask: "255.255.255.0",
            family: "IPv4",
            mac: "00:00:00:00:00:01",
            internal: false,
            cidr: "10.1.0.77/24",
          },
          {
            address: "169.254.3.4",
            netmask: "255.255.0.0",
            family: "IPv4",
            mac: "00:00:00:00:00:01",
            internal: false,
            cidr: "169.254.3.4/16",
          },
        ],
        Loopback: [
          {
            address: "127.0.0.1",
            netmask: "255.0.0.0",
            family: "IPv4",
            mac: "00:00:00:00:00:00",
            internal: true,
            cidr: "127.0.0.1/8",
          },
        ],
        Unplugged: undefined,
      }),
    ).toEqual(["10.1.0"])
  })
})

describe(listScanOrigins.name, () => {
  test("tries the well-known names, then both ports on every host", () => {
    const origins = listScanOrigins(["10.1.0"])
    expect(origins.slice(0, 4)).toEqual([
      "http://castkit.local:8788",
      "http://castkit.local:8789",
      "http://castkit:8788",
      "http://castkit:8789",
    ])
    expect(origins).toHaveLength(4 + 254 * 2)
    expect(origins.at(-1)).toBe("http://10.1.0.254:8789")
  })
})

describe(findServers.name, () => {
  test("uses a server's public address when it answers, and lists one server once", async () => {
    const servers = await findServers({
      origins: [
        "http://castkit.local:8788",
        "http://10.1.0.5:8788",
        "http://10.1.0.6:8789",
        "http://10.1.0.7:8789",
      ],
      isPortOpen: async ({ host }) => host !== "10.1.0.5",
      identify: async (origin) =>
        origin === "http://10.1.0.6:8789" ||
        origin === "http://castkit.local:8788"
          ? {
              product: "castkit",
              publicUrl: "https://castkit.example.test/",
            }
          : origin === "https://castkit.example.test"
            ? { product: "castkit", publicUrl: null }
            : null,
    })
    expect(servers).toEqual([
      {
        origin: "https://castkit.example.test",
        networkOrigin: "http://castkit.local:8788",
      },
    ])
  })

  test("keeps the network address when the public one does not answer from here", async () => {
    const servers = await findServers({
      origins: ["http://10.1.0.6:8789"],
      isPortOpen: async () => true,
      identify: async (origin) =>
        origin.startsWith("http://10.")
          ? {
              product: "castkit",
              publicUrl: "https://castkit.example.test",
            }
          : null,
    })
    expect(servers).toEqual([
      {
        origin: "http://10.1.0.6:8789",
        networkOrigin: "http://10.1.0.6:8789",
      },
    ])
  })
})
