// VBAN audio packets, as VB-Audio's VBAN specification lays them out: a
// 28-byte header, then up to 256 sample frames of interleaved PCM. Music
// Assistant's VBAN Receiver plugin reads them with `aiovban`.
//
// Header, every multi-byte field little-endian:
//   0  "VBAN"
//   4  sub-protocol (top 3 bits, 0 = audio) | sample-rate index (low 5 bits)
//   5  sample frames in this packet, minus one
//   6  channels, minus one
//   7  codec (top 4 bits, 0 = PCM) | bit resolution (low 3 bits, 1 = INT16)
//   8  stream name, ASCII, zero-padded to 16 bytes
//   24 frame counter, uint32

const headerLength = 28
const streamNameLength = 16
const int16Resolution = 0x01
const bytesPerSample = 2

/** The most sample frames one packet may carry. */
export const maxSamplesPerPacket = 256

/** The largest payload a packet may carry, in bytes. */
export const maxPayloadLength = 1436

/** The sample rates VBAN can name, in the order of their index. */
const sampleRates = [
  6000, 12000, 24000, 48000, 96000, 192000, 384000, 8000,
  16000, 32000, 64000, 128000, 256000, 512000, 11025, 22050,
  44100, 88200, 176400, 352800, 705600,
] as const

/** The index VBAN gives a sample rate, or `null` when VBAN cannot carry it. */
export const readSampleRateIndex = (sampleRate: number) => {
  const index = sampleRates.indexOf(
    sampleRate as (typeof sampleRates)[number],
  )
  return index === -1 ? null : index
}

/** A stream name is at most 16 characters of printable ASCII. */
export const isValidStreamName = (streamName: string) =>
  streamName.length > 0 &&
  streamName.length <= streamNameLength &&
  /^[\x20-\x7e]+$/.test(streamName)

/** How many sample frames fit in one packet for this many channels. */
export const readSamplesPerPacket = (channels: number) =>
  Math.min(
    maxSamplesPerPacket,
    Math.floor(
      maxPayloadLength / (channels * bytesPerSample),
    ),
  )

/** One 16-bit PCM audio packet. `pcm` holds whole interleaved sample frames. */
export const buildAudioPacket = ({
  streamName,
  sampleRate,
  channels,
  frameCounter,
  pcm,
}: {
  streamName: string
  sampleRate: number
  channels: number
  frameCounter: number
  pcm: Uint8Array
}) => {
  const sampleRateIndex = readSampleRateIndex(sampleRate)
  if (sampleRateIndex === null) {
    throw new RangeError(
      `VBAN cannot carry a sample rate of ${sampleRate}.`,
    )
  }
  if (!isValidStreamName(streamName)) {
    throw new RangeError(
      `"${streamName}" is not a VBAN stream name.`,
    )
  }
  const frameLength = channels * bytesPerSample
  const sampleCount = pcm.length / frameLength
  if (
    !Number.isInteger(sampleCount) ||
    sampleCount < 1 ||
    sampleCount > readSamplesPerPacket(channels)
  ) {
    throw new RangeError(
      `A packet carries 1 to ${readSamplesPerPacket(channels)} whole sample frames, not ${pcm.length} bytes.`,
    )
  }
  const packet = Buffer.alloc(headerLength + pcm.length)
  packet.write("VBAN", 0, "ascii")
  packet.writeUInt8(sampleRateIndex, 4)
  packet.writeUInt8(sampleCount - 1, 5)
  packet.writeUInt8(channels - 1, 6)
  packet.writeUInt8(int16Resolution, 7)
  packet.write(streamName, 8, streamNameLength, "ascii")
  packet.writeUInt32LE(frameCounter >>> 0, 24)
  packet.set(pcm, headerLength)
  return packet
}

/**
 * Cuts a stream of 16-bit PCM, arriving in chunks of any length, into full
 * VBAN packets. A chunk that ends mid-packet keeps its tail for the next one,
 * so the receiver gets an even stream of full packets with no gap.
 */
export const createPacketizer = ({
  streamName,
  sampleRate,
  channels,
  onPacket,
}: {
  streamName: string
  sampleRate: number
  channels: number
  onPacket: (packet: Buffer) => void
}) => {
  const payloadLength =
    readSamplesPerPacket(channels) *
    channels *
    bytesPerSample
  const pending = {
    bytes: Buffer.alloc(0),
    frameCounter: 0,
  }
  const push = (pcm: Uint8Array) => {
    const bytes = Buffer.concat([pending.bytes, pcm])
    const packetCount = Math.floor(
      bytes.length / payloadLength,
    )
    Array.from({ length: packetCount }).forEach(
      (_, index) => {
        onPacket(
          buildAudioPacket({
            streamName,
            sampleRate,
            channels,
            frameCounter: pending.frameCounter,
            pcm: bytes.subarray(
              index * payloadLength,
              (index + 1) * payloadLength,
            ),
          }),
        )
        pending.frameCounter =
          (pending.frameCounter + 1) >>> 0
      },
    )
    pending.bytes = Buffer.from(
      bytes.subarray(packetCount * payloadLength),
    )
  }
  return { push }
}
