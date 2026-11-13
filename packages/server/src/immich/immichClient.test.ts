import {
  afterEach,
  describe,
  expect,
  test,
  vi,
} from "vitest"
import {
  applyPeopleMinimum,
  computeRecencyWeight,
  fetchPreviewJpeg,
  getIsPortraitAsset,
  IMMICH_REQUEST_TIMEOUT_MILLISECONDS,
  type ImmichConfig,
  listPeople,
  pickWeightedIndex,
} from "./immichClient.ts"

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000
const NOW_MS = Date.parse("2026-07-02T00:00:00.000Z")

describe("computeRecencyWeight", () => {
  test("a photo taken right now weighs exactly 1", () => {
    expect(
      computeRecencyWeight({
        createdAtMs: NOW_MS,
        nowMs: NOW_MS,
        halfLifeDays: 365,
      }),
    ).toBe(1)
  })

  test("a photo one half-life old weighs 0.5", () => {
    expect(
      computeRecencyWeight({
        createdAtMs: NOW_MS - 365 * MILLISECONDS_PER_DAY,
        nowMs: NOW_MS,
        halfLifeDays: 365,
      }),
    ).toBeCloseTo(0.5, 10)
  })

  test("a photo two half-lives old weighs 0.25", () => {
    expect(
      computeRecencyWeight({
        createdAtMs: NOW_MS - 60 * MILLISECONDS_PER_DAY,
        nowMs: NOW_MS,
        halfLifeDays: 30,
      }),
    ).toBeCloseTo(0.25, 10)
  })

  test("an ancient photo clamps to the 0.15 floor", () => {
    expect(
      computeRecencyWeight({
        createdAtMs:
          NOW_MS - 40 * 365 * MILLISECONDS_PER_DAY,
        nowMs: NOW_MS,
        halfLifeDays: 365,
      }),
    ).toBe(0.15)
  })

  test("a missing timestamp (createdAtMs 0) clamps to the floor", () => {
    expect(
      computeRecencyWeight({
        createdAtMs: 0,
        nowMs: NOW_MS,
        halfLifeDays: 365,
      }),
    ).toBe(0.15)
  })
})

describe("pickWeightedIndex", () => {
  test("returns -1 for an empty weight list", () => {
    expect(
      pickWeightedIndex({ weights: [], randomValue: 0.5 }),
    ).toBe(-1)
  })

  test("a single weight is always index 0", () => {
    expect(
      pickWeightedIndex({
        weights: [0.15],
        randomValue: 0.999,
      }),
    ).toBe(0)
  })

  test("equal weights split the draw range evenly", () => {
    const weights = [1, 1]

    expect(
      pickWeightedIndex({ weights, randomValue: 0 }),
    ).toBe(0)
    expect(
      pickWeightedIndex({ weights, randomValue: 0.49 }),
    ).toBe(0)
    expect(
      pickWeightedIndex({ weights, randomValue: 0.5 }),
    ).toBe(1)
    expect(
      pickWeightedIndex({ weights, randomValue: 0.99 }),
    ).toBe(1)
  })

  test("heavier weights capture proportionally more of the draw range", () => {
    const weights = [1, 3]

    // Cumulative sums are [1, 4]; the boundary sits at randomValue 0.25.
    expect(
      pickWeightedIndex({ weights, randomValue: 0.2 }),
    ).toBe(0)
    expect(
      pickWeightedIndex({ weights, randomValue: 0.25 }),
    ).toBe(1)
    expect(
      pickWeightedIndex({ weights, randomValue: 0.9 }),
    ).toBe(1)
  })

  test("a middle index is reachable", () => {
    expect(
      pickWeightedIndex({
        weights: [1, 2, 1],
        randomValue: 0.5,
      }),
    ).toBe(1)
  })

  test("randomValue at the top edge falls back to the last index", () => {
    expect(
      pickWeightedIndex({
        weights: [1, 1, 1],
        randomValue: 1,
      }),
    ).toBe(2)
  })

  test("all-zero weights fall back to a uniform pick", () => {
    expect(
      pickWeightedIndex({
        weights: [0, 0, 0, 0],
        randomValue: 0.6,
      }),
    ).toBe(2)
    expect(
      pickWeightedIndex({
        weights: [0, 0],
        randomValue: 1,
      }),
    ).toBe(1)
  })
})

describe("getIsPortraitAsset", () => {
  test("taller than wide is portrait", () => {
    expect(
      getIsPortraitAsset({ width: 3000, height: 4000 }),
    ).toBe(true)
  })

  test("wider than tall is not portrait", () => {
    expect(
      getIsPortraitAsset({ width: 4000, height: 3000 }),
    ).toBe(false)
  })

  test("a square asset is not portrait", () => {
    expect(
      getIsPortraitAsset({ width: 2000, height: 2000 }),
    ).toBe(false)
  })

  test("missing dimensions read as not portrait", () => {
    expect(
      getIsPortraitAsset({
        width: undefined,
        height: 4000,
      }),
    ).toBe(false)
    expect(
      getIsPortraitAsset({
        width: undefined,
        height: undefined,
      }),
    ).toBe(false)
  })
})

describe("applyPeopleMinimum", () => {
  const POOL = [
    {
      id: "all-three",
      createdAtMs: 0,
      isPortrait: true,
      matchedPersonCount: 3,
    },
    {
      id: "two-of-them",
      createdAtMs: 0,
      isPortrait: false,
      matchedPersonCount: 2,
    },
    {
      id: "just-one",
      createdAtMs: 0,
      isPortrait: true,
      matchedPersonCount: 1,
    },
  ]

  test("a minimum of 1 keeps the whole any-of union", () => {
    expect(
      applyPeopleMinimum({
        pool: POOL,
        peopleMinimum: 1,
      }).map((entry) => entry.id),
    ).toEqual(["all-three", "two-of-them", "just-one"])
  })

  test("a minimum of 2 keeps only assets with at least two", () => {
    expect(
      applyPeopleMinimum({
        pool: POOL,
        peopleMinimum: 2,
      }).map((entry) => entry.id),
    ).toEqual(["all-three", "two-of-them"])
  })

  test("a minimum equal to the name count keeps only all-of", () => {
    expect(
      applyPeopleMinimum({
        pool: POOL,
        peopleMinimum: 3,
      }).map((entry) => entry.id),
    ).toEqual(["all-three"])
  })

  test("a minimum nothing satisfies falls back to the union", () => {
    expect(
      applyPeopleMinimum({
        pool: POOL,
        peopleMinimum: 9,
      }).map((entry) => entry.id),
    ).toEqual(["all-three", "two-of-them", "just-one"])
  })

  test("an empty pool stays empty rather than looping", () => {
    expect(
      applyPeopleMinimum({ pool: [], peopleMinimum: 2 }),
    ).toEqual([])
  })
})

describe("Immich requests time out", () => {
  const config: ImmichConfig = {
    url: "http://immich.example:2283/",
    apiKey: "test-key",
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test("a JSON request carries an abort signal", async () => {
    const fetchSpy = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ people: [] })),
    )
    vi.stubGlobal("fetch", fetchSpy)
    await listPeople(config)
    expect(
      fetchSpy.mock.calls[0]?.[1]?.signal,
    ).toBeInstanceOf(AbortSignal)
  })

  test("a preview download carries an abort signal", async () => {
    const fetchSpy = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(new Uint8Array([1, 2, 3])),
    )
    vi.stubGlobal("fetch", fetchSpy)
    const preview = await fetchPreviewJpeg({
      config,
      assetId: "asset-1",
    })
    expect(preview.byteLength).toBe(3)
    expect(
      fetchSpy.mock.calls[0]?.[1]?.signal,
    ).toBeInstanceOf(AbortSignal)
  })

  test("a request that outlives its signal rejects instead of hanging", async () => {
    vi.stubGlobal(
      "fetch",
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          if (init?.signal?.aborted) {
            reject(init.signal.reason)
          }
          init?.signal?.addEventListener("abort", () => {
            reject(init.signal?.reason)
          })
        }),
    )
    const timeoutSpy = vi
      .spyOn(AbortSignal, "timeout")
      .mockImplementation(() => AbortSignal.abort())
    await expect(listPeople(config)).rejects.toThrow()
    expect(timeoutSpy).toHaveBeenCalledWith(
      IMMICH_REQUEST_TIMEOUT_MILLISECONDS,
    )
    timeoutSpy.mockRestore()
  })
})
