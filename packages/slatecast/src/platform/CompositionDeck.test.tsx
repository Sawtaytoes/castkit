import { render, waitFor } from "@testing-library/preact"
import { useState } from "preact/hooks"
import { afterEach, expect, test } from "vitest"
import { CompositionDeck } from "./CompositionDeck.tsx"
import {
  clearDisplayCache,
  rememberDisplay,
} from "./displayCache.ts"
import { compositionFixture } from "./fixtures.ts"
import type { DisplaySnapshot } from "./protocol.ts"

const target = {
  kind: "view" as const,
  id: "main",
  deviceId: "display-example",
}
const snapshot = (
  id: string,
  specId = "text",
): DisplaySnapshot => ({
  ...compositionFixture,
  target: { ...target, id },
  view: {
    ...compositionFixture.view,
    id,
    panels: [
      { id: "panel", specId, bindings: {}, settings: {} },
    ],
  },
})
const Content = ({
  snapshot: entry,
}: {
  snapshot: DisplaySnapshot
}) => {
  const [identity] = useState(() => Math.random())
  return (
    <button type="button" data-instance={identity}>
      {entry.view.id}
    </button>
  )
}
const drawing = (id: string) => (
  <CompositionDeck
    snapshot={snapshot(id)}
    target={{ ...target, id }}
    renderComposition={({ snapshot: entry }) => (
      <Content snapshot={entry} />
    )}
  />
)
afterEach(clearDisplayCache)

test("prepared screens retain their DOM identity and only the selected one accepts input", async () => {
  rememberDisplay({ snapshot: snapshot("main") })
  rememberDisplay({ snapshot: snapshot("points") })
  const screen = render(drawing("main"))
  await waitFor(() =>
    expect(
      screen.container.querySelectorAll("button"),
    ).toHaveLength(2),
  )
  const points = Array.from(
    screen.container.querySelectorAll("button"),
  ).find((button) => button.textContent === "points")!
  const main = Array.from(
    screen.container.querySelectorAll("button"),
  ).find((button) => button.textContent === "main")!
  expect(points.closest("[inert]")).not.toBeNull()
  expect(points).not.toBeVisible()
  screen.rerender(drawing("points"))
  expect(
    Array.from(
      screen.container.querySelectorAll("button"),
    ).find((button) => button.textContent === "points"),
  ).toBe(points)
  expect(points.closest("[inert]")).toBeNull()
  expect(points).toBeVisible()
  expect(main.closest("[aria-hidden=true]")).not.toBeNull()
  screen.rerender(drawing("main"))
  expect(
    Array.from(
      screen.container.querySelectorAll("button"),
    ).find((button) => button.textContent === "main"),
  ).toBe(main)
})

test("standby trees are bounded and exclude camera, plugin and other-device compositions", async () => {
  Array.from({ length: 6 }, (_, index) =>
    snapshot(`prepared-${index}`),
  ).forEach((entry) => {
    rememberDisplay({ snapshot: entry })
  })
  rememberDisplay({
    snapshot: snapshot("camera", "camera-alert"),
  })
  rememberDisplay({
    snapshot: {
      ...snapshot("plugin"),
      viewSpecs: [
        { id: "text", browserEntry: "/extension.js" },
      ],
    } as DisplaySnapshot,
  })
  rememberDisplay({
    snapshot: snapshot("other-device"),
    target: {
      ...target,
      id: "other-device",
      deviceId: "another-display",
    },
  })
  const screen = render(drawing("main"))
  await waitFor(() =>
    expect(
      screen.container.querySelectorAll("button"),
    ).toHaveLength(4),
  )
  expect(screen.container.textContent).not.toContain(
    "camera",
  )
  expect(screen.container.textContent).not.toContain(
    "plugin",
  )
  expect(screen.container.textContent).not.toContain(
    "other-device",
  )
  clearDisplayCache()
  await waitFor(() =>
    expect(
      screen.container.querySelectorAll("button"),
    ).toHaveLength(1),
  )
  expect(screen.container.textContent).toBe("main")
})
