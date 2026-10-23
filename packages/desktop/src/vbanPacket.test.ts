import { describe, expect, test } from "vitest"
import {
  buildAudioPacket,
  createPacketizer,
  isValidStreamName,
  readSampleRateIndex,
  readSamplesPerPacket,
} from "./vbanPacket.ts"

describe(buildAudioPacket.name, () => {
  test("writes the VBAN audio header before the samples", () => {
    const pcm = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    const packet = buildAudioPacket({
      streamName: "Desk",
      sampleRate: 48000,
      channels: 2,
      frameCounter: 513,
      pcm,
    })
    expect(packet.length).toBe(28 + 8)
    expect(packet.subarray(0, 4).toString("ascii")).toBe(
      "VBAN",
    )
    // Audio sub-protocol (0) and rate index 3 (48 kHz).
    expect(packet[4]).toBe(3)
    // Two sample frames, two channels: both stored minus one.
    expect(packet[5]).toBe(1)
    expect(packet[6]).toBe(1)
    // PCM codec (0) and INT16 resolution (1).
    expect(packet[7]).toBe(1)
    expect(packet.subarray(8, 24).toString("ascii")).toBe(
      `Desk${"\0".repeat(12)}`,
    )
    expect(packet.readUInt32LE(24)).toBe(513)
    expect([...packet.subarray(28)]).toEqual([...pcm])
  })

  test("refuses a packet that is not whole sample frames", () => {
    expect(() =>
      buildAudioPacket({
        streamName: "Desk",
        sampleRate: 48000,
        channels: 2,
        frameCounter: 0,
        pcm: new Uint8Array(6),
      }),
    ).toThrow(RangeError)
  })

  test("refuses more samples than one packet may carry", () => {
    expect(() =>
      buildAudioPacket({
        streamName: "Desk",
        sampleRate: 48000,
        channels: 2,
        frameCounter: 0,
        pcm: new Uint8Array(257 * 4),
      }),
    ).toThrow(RangeError)
  })
})

describe(readSampleRateIndex.name, () => {
  test("names the rates VBAN can carry", () => {
    expect(readSampleRateIndex(48000)).toBe(3)
    expect(readSampleRateIndex(44100)).toBe(16)
    expect(readSampleRateIndex(47999)).toBeNull()
  })
})

describe(isValidStreamName.name, () => {
  test("allows 1 to 16 printable ASCII characters", () => {
    expect(isValidStreamName("CastKit")).toBe(true)
    expect(isValidStreamName("Sixteen chars ok")).toBe(true)
    expect(isValidStreamName("Seventeen chars!!")).toBe(
      false,
    )
    expect(isValidStreamName("")).toBe(false)
    expect(isValidStreamName("Café")).toBe(false)
  })
})

describe(readSamplesPerPacket.name, () => {
  test("is 256 frames until the payload limit is smaller", () => {
    expect(readSamplesPerPacket(2)).toBe(256)
    expect(readSamplesPerPacket(8)).toBe(89)
  })
})

describe(createPacketizer.name, () => {
  test("cuts uneven chunks into full packets and counts them", () => {
    const packets: Buffer[] = []
    const packetizer = createPacketizer({
      streamName: "Desk",
      sampleRate: 48000,
      channels: 2,
      onPacket: (packet) => packets.push(packet),
    })
    const stream = Uint8Array.from(
      { length: 1024 * 3 },
      (_, index) => index % 251,
    )
    packetizer.push(stream.subarray(0, 700))
    expect(packets).toHaveLength(0)
    packetizer.push(stream.subarray(700, 2500))
    expect(packets).toHaveLength(2)
    packetizer.push(stream.subarray(2500))
    expect(packets).toHaveLength(3)
    expect(
      packets.map((packet) => packet.readUInt32LE(24)),
    ).toEqual([0, 1, 2])
    expect([
      ...Buffer.concat(
        packets.map((packet) => packet.subarray(28)),
      ),
    ]).toEqual([...stream])
  })
})
