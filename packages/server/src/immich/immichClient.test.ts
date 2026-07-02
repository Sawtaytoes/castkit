import { describe, expect, test } from "vitest"
import {
  computeRecencyWeight,
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
