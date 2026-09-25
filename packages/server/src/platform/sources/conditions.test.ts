import { isVisible } from "@castkit/sdk/conditions"
import { expect, test } from "vitest"

test("shared visibility gates fail closed for unavailable and malformed conditions", () => {
  const entities = [{ id: "light.desk", state: "on" }]
  expect(
    isVisible({ condition: undefined, entities }),
  ).toBe(true)
  expect(
    isVisible({
      condition: '{"entityId":"light.desk","state":"on"}',
      entities,
    }),
  ).toBe(true)
  expect(
    isVisible({
      condition: {
        entityId: "light.other",
        notState: "off",
      },
      entities,
    }),
  ).toBe(false)
  expect(
    isVisible({ condition: "invalid", entities }),
  ).toBe(false)
  expect(
    isVisible({
      condition: [
        { entityId: "light.desk", state: "on" },
        { entityId: "light.desk", notState: "on" },
      ],
      entities,
    }),
  ).toBe(false)
})

test("condition trees preserve OR rules and viewport checks remain presentation only", () => {
  const entities = [
    { id: "input_boolean.enabled", state: "on" },
  ]
  const condition = {
    any: [
      { entityId: "input_boolean.missing", state: "on" },
      {
        all: [
          {
            entityId: "input_boolean.enabled",
            state: "on",
          },
          { mediaQuery: "(min-width: 800px)" },
        ],
      },
    ],
  }
  expect(isVisible({ condition, entities })).toBe(true)
  expect(
    isVisible({
      condition,
      entities,
      matchMedia: () => false,
    }),
  ).toBe(false)
  expect(
    isVisible({
      condition,
      entities,
      matchMedia: () => true,
    }),
  ).toBe(true)
})
