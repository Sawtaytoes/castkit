import {
  afterEach,
  beforeEach,
  expect,
  test,
  vi,
} from "vitest"
import { createFramePacer } from "./framePacer.ts"

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(100_000)
})
afterEach(() => {
  vi.useRealTimers()
})

const createRecordingPacer = (
  bufferMilliseconds = 1000,
) => {
  const released: {
    pictures: { id: number; at: number }[]
  } = {
    pictures: [],
  }
  const pacer = createFramePacer<number>({
    bufferMilliseconds,
    onRelease: (id) => {
      released.pictures = released.pictures.concat({
        id,
        at: Date.now(),
      })
    },
  })
  return { pacer, released }
}

/** One second of a 10-per-second camera, decoded all at once as a part arrives. */
const pushPart = (
  pacer: ReturnType<typeof createFramePacer<number>>,
  firstPicture: number,
) => {
  Array.from({ length: 10 }).forEach((_, index) => {
    const picture = firstPicture + index
    pacer.push(picture, picture * 100)
  })
}

test("a part decoded at once is spread over the second it covers", () => {
  const { pacer, released } = createRecordingPacer()
  pushPart(pacer, 0)
  vi.advanceTimersByTime(1000)
  pushPart(pacer, 10)
  vi.advanceTimersByTime(1000)
  pushPart(pacer, 20)
  vi.advanceTimersByTime(1000)
  const secondPart = released.pictures.filter(
    (picture) => picture.id >= 10 && picture.id < 20,
  )
  // Every picture of a steady part reaches the panel, 100 ms apart, instead
  // of the whole second collapsing into its newest picture.
  expect(secondPart.map((picture) => picture.id)).toEqual([
    10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
  ])
  expect(
    secondPart
      .slice(1)
      .map(
        (picture, index) =>
          picture.at - (secondPart[index]?.at ?? 0),
      ),
  ).toEqual([100, 100, 100, 100, 100, 100, 100, 100, 100])
  pacer.dispose()
})

test("a late part skips straight to its newest due picture and never goes back", () => {
  const { pacer, released } = createRecordingPacer()
  pushPart(pacer, 0)
  vi.advanceTimersByTime(1000)
  // The next part arrives 2.5 s late.
  vi.advanceTimersByTime(2500)
  pushPart(pacer, 10)
  vi.advanceTimersByTime(3000)
  const ids = released.pictures.map((picture) => picture.id)
  expect(ids).toEqual(
    ids.toSorted((left, right) => left - right),
  )
  // Pictures already older than the buffer are dropped, not replayed late.
  expect(ids.filter((id) => id >= 10).length).toBeLessThan(
    10,
  )
  expect(ids.at(-1)).toBe(19)
  pacer.dispose()
})

test("disposal drops every queued picture", () => {
  const { pacer, released } = createRecordingPacer()
  pushPart(pacer, 0)
  const count = released.pictures.length
  pacer.dispose()
  vi.advanceTimersByTime(5000)
  expect(released.pictures.length).toBe(count)
})
