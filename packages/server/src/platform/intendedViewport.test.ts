import { expect, test } from "vitest"
import { platformSchemas } from "./platformStore.ts"

const view = {
  id: "wrist-totals",
  name: "Wrist totals",
  layout: "single",
  panels: [
    {
      id: "totals",
      specId: "kids-points",
      bindings: {},
      settings: {},
    },
  ],
  theme: "light",
  access: "public",
  isControlEnabled: false,
}

test("view validation preserves an optional intended viewport", () => {
  expect(
    platformSchemas.views.parse(view).intendedViewport,
  ).toBeUndefined()
  expect(
    platformSchemas.views.parse({
      ...view,
      intendedViewport: { width: 200, height: 200 },
    }).intendedViewport,
  ).toEqual({ width: 200, height: 200 })
})

test.each([
  { width: 0, height: 200 },
  { width: 200, height: 7681 },
  { width: 200.5, height: 200 },
  { width: 200 },
])("view validation rejects invalid intended viewport %j", (intendedViewport) => {
  expect(
    platformSchemas.views.safeParse({
      ...view,
      intendedViewport,
    }).success,
  ).toBe(false)
})
