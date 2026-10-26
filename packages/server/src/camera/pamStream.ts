/** One decoded picture from ffmpeg's `pam` image pipe: packed RGB rows. */
export type DecodedPicture = {
  width: number
  height: number
  rgb: Buffer
}

const headerEnd = Buffer.from("ENDHDR\n")

const readHeaderValue = (header: string, name: string) =>
  Number(
    new RegExp(`^${name} (\\d+)$`, "m").exec(header)?.[1],
  )

/**
 * Split ffmpeg's `-c:v pam -f image2pipe` output into pictures. Each PAM
 * picture states its own size, so the decoder's scaled size never has to be
 * predicted from the camera's aspect ratio.
 */
export const createPamParser = (
  onPicture: (picture: DecodedPicture) => void,
) => {
  const state: { pending: Buffer } = {
    pending: Buffer.alloc(0),
  }
  const drain = (): void => {
    const end = state.pending.indexOf(headerEnd)
    if (end < 0) {
      if (state.pending.length > 4096)
        throw new Error(
          "The decoder sent no picture header.",
        )
      return
    }
    const header = state.pending
      .subarray(0, end)
      .toString("latin1")
    if (!header.startsWith("P7\n"))
      throw new Error(
        "The decoder sent an unknown picture.",
      )
    const width = readHeaderValue(header, "WIDTH")
    const height = readHeaderValue(header, "HEIGHT")
    const depth = readHeaderValue(header, "DEPTH")
    if (
      !(width > 0 && height > 0) ||
      depth !== 3 ||
      readHeaderValue(header, "MAXVAL") !== 255
    )
      throw new Error(
        "The decoder sent an unsupported picture.",
      )
    const start = end + headerEnd.length
    const length = width * height * depth
    if (state.pending.length < start + length) return
    const rgb = Buffer.from(
      state.pending.subarray(start, start + length),
    )
    state.pending = state.pending.subarray(start + length)
    onPicture({ width, height, rgb })
    drain()
  }
  return {
    push: (chunk: Buffer) => {
      state.pending =
        state.pending.length === 0
          ? chunk
          : Buffer.concat([state.pending, chunk])
      drain()
    },
  }
}
