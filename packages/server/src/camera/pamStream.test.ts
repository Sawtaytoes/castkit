import { expect, test } from "vitest"
import {
  createPamParser,
  type DecodedPicture,
} from "./pamStream.ts"

const pam = (width: number, height: number, fill: number) =>
  Buffer.concat([
    Buffer.from(
      `P7\nWIDTH ${width}\nHEIGHT ${height}\nDEPTH 3\nMAXVAL 255\nTUPLTYPE RGB\nENDHDR\n`,
    ),
    Buffer.alloc(width * height * 3, fill),
  ])

test("pictures split across chunks come out whole and in order", () => {
  const received: { pictures: DecodedPicture[] } = {
    pictures: [],
  }
  const parser = createPamParser((picture) => {
    received.pictures = received.pictures.concat(picture)
  })
  const stream = Buffer.concat([
    pam(4, 3, 10),
    pam(4, 3, 20),
    pam(2, 2, 30),
  ])
  Array.from({
    length: Math.ceil(stream.length / 7),
  }).forEach((_, index) => {
    parser.push(stream.subarray(index * 7, (index + 1) * 7))
  })
  expect(
    received.pictures.map((picture) => [
      picture.width,
      picture.height,
      picture.rgb.length,
      picture.rgb[0],
    ]),
  ).toEqual([
    [4, 3, 36, 10],
    [4, 3, 36, 20],
    [2, 2, 12, 30],
  ])
})

test("a stream that is not PAM is refused", () => {
  const parser = createPamParser(() => undefined)
  expect(() =>
    parser.push(Buffer.from("P6\n4 3\n255\nENDHDR\n")),
  ).toThrow("unknown picture")
})
