import type { ContractData } from "@castkit/sdk/contracts"
import {
  render,
  screen,
  waitFor,
} from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"
import { page } from "vitest/browser"
import { pointsOverviewFixture } from "./__fixtures__/pointsOverview.ts"
import { DisplayComposition } from "./PlatformApp.tsx"
import "../styles.css"
import "./platform.css"

afterEach(() => vi.restoreAllMocks())
const drawing = (
  isBusy = false,
  repaint: "instant" | "slow" = "instant",
) => (
  <main class="platform" data-device="true">
    <DisplayComposition
      snapshot={{
        ...pointsOverviewFixture({ isBusy }),
        displayProperties: { repaint, hasTouch: true },
      }}
      isConnected
      onAction={async () => undefined}
    />
  </main>
)
const openChild = async () => {
  await userEvent.click(
    screen.getByRole("button", {
      name: "View Robin's tasks today",
    }),
  )
  await waitFor(() =>
    expect(
      document.querySelector("[data-navigation-focus]"),
    ).not.toBeNull(),
  )
}
const panel = (spec: string) =>
  document.querySelector<HTMLElement>(
    `[data-spec='${spec}']`,
  )!
const settle = async () => {
  await waitFor(() =>
    expect(
      document
        .getAnimations()
        .filter(
          (animation) => animation.playState === "running",
        ),
    ).toHaveLength(0),
  )
}

test.each([
  false,
  true,
])("detail reserves full height and keeps readable AI beside it at 1024 × 600 (busy: %s)", async (isBusy) => {
  await page.viewport(1024, 600)
  render(drawing(isBusy))
  await document.fonts.ready
  const ai = panel("ai-usage")
  const points = panel("kids-points")
  await openChild()
  await settle()
  await waitFor(() => {
    const detail = points.getBoundingClientRect()
    const composition = document
      .querySelector(".platform-layout")
      ?.getBoundingClientRect()
    if (!composition) throw new Error("Missing composition")
    const usage = ai.getBoundingClientRect()
    expect(detail.height).toBeCloseTo(composition.height, 0)
    expect(detail.width).toBeGreaterThan(480)
    expect(usage.left).toBeGreaterThan(detail.right)
    expect(usage.height).toBeCloseTo(composition.height, 0)
    expect(ai).toBeVisible()
    expect(ai.querySelector(".ai-usage-more")).toBeNull()
  })
  expect(panel("ai-usage")).toBe(ai)
  expect(
    points.querySelector(".kids-points-task-list")
      ?.clientHeight,
  ).toBeGreaterThan(250)
  await userEvent.click(
    screen.getByRole("button", {
      name: "Back to all children",
    }),
  )
  await waitFor(() =>
    expect(
      document.querySelector("[data-navigation-focus]"),
    ).toBeNull(),
  )
  await settle()
  expect(panel("ai-usage")).toBe(ai)
  expect(panel("kids-points")).toBe(points)
  expect(
    screen.getByRole("button", {
      name: "View Sky's tasks today",
    }),
  ).toBeVisible()
  if (isBusy)
    expect(
      points.querySelectorAll(".kids-points-summary-child"),
    ).toHaveLength(3)
})

test("resize hides the AI rail before squeezing detail and preserves a selected task", async () => {
  await page.viewport(1024, 600)
  render(drawing())
  await openChild()
  await userEvent.click(
    screen.getByRole("button", {
      name: "View Reading scans",
    }),
  )
  const detail = document.querySelector(
    ".kids-points-tasks",
  )
  await page.viewport(480, 480)
  await settle()
  await waitFor(() => {
    expect(panel("ai-usage")).not.toBeVisible()
    expect(
      panel("kids-points").getBoundingClientRect().width,
    ).toBeCloseTo(
      document
        .querySelector(".platform-layout")
        ?.getBoundingClientRect().width ?? 0,
      0,
    )
  })
  expect(
    screen.getByRole("region", {
      name: "Scroll Reading scans",
    }),
  ).toBeVisible()
  expect(document.querySelector(".kids-points-tasks")).toBe(
    detail,
  )
  await page.viewport(1024, 600)
  await waitFor(() =>
    expect(panel("ai-usage")).toBeVisible(),
  )
  expect(
    screen.getByRole("region", {
      name: "Scroll Reading scans",
    }),
  ).toBeVisible()
  await userEvent.click(
    screen.getByRole("button", {
      name: "Back to today's tasks",
    }),
  )
  expect(
    document.querySelector("[data-navigation-focus]"),
  ).not.toBeNull()
  expect(
    screen.getByRole("button", {
      name: "View Dishes scans",
    }),
  ).toBeVisible()
})

test("too many selected quotas hide the rail rather than dropping numbers", async () => {
  await page.viewport(1024, 600)
  const snapshot = pointsOverviewFixture()
  const usage = snapshot.channels.usage
    ?.data as ContractData["ai-usage.v1"]
  snapshot.channels = {
    ...snapshot.channels,
    usage: {
      ...snapshot.channels.usage!,
      data: {
        providers: Array.from(
          { length: 20 },
          (_, index) => ({
            ...usage.providers[0]!,
            id: `account-${index}`,
            name: `Account ${index}`,
          }),
        ),
      },
    },
  }
  render(
    <main class="platform">
      <DisplayComposition
        snapshot={snapshot}
        isConnected
        onAction={async () => undefined}
      />
    </main>,
  )
  await openChild()
  await settle()
  await waitFor(() =>
    expect(panel("ai-usage")).not.toBeVisible(),
  )
  expect(
    screen.getByRole("heading", { name: "Today's tasks" }),
  ).toBeVisible()
})

test("navigation animates the measured reflow and both Back levels", async () => {
  await page.viewport(1024, 600)
  const animate = vi.spyOn(Element.prototype, "animate")
  render(drawing())
  await openChild()
  await waitFor(() => expect(animate).toHaveBeenCalled())
  const keyframes = animate.mock.calls.flatMap(
    ([frames]) => (Array.isArray(frames) ? frames : []),
  )
  expect(
    keyframes.some((frame) =>
      String(frame.transform).startsWith("translate("),
    ),
  ).toBe(true)
  await settle()
  animate.mockClear()
  await userEvent.click(
    screen.getByRole("button", {
      name: "View Reading scans",
    }),
  )
  await waitFor(() => expect(animate).toHaveBeenCalled())
  await settle()
  animate.mockClear()
  await userEvent.click(
    screen.getByRole("button", {
      name: "Back to today's tasks",
    }),
  )
  await waitFor(() => expect(animate).toHaveBeenCalled())
  await settle()
  animate.mockClear()
  await userEvent.click(
    screen.getByRole("button", {
      name: "Back to all children",
    }),
  )
  await waitFor(() => expect(animate).toHaveBeenCalled())
})

test.each([
  "slow",
  "reduced",
] as const)("%s motion opens the same priority layout without reflow animation", async (motion) => {
  await page.viewport(1024, 600)
  const animate = vi.spyOn(Element.prototype, "animate")
  if (motion === "reduced") {
    const matchMedia = window.matchMedia.bind(window)
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query) => {
        const result = matchMedia(query)
        if (query === "(prefers-reduced-motion: reduce)")
          Object.defineProperty(result, "matches", {
            value: true,
          })
        return result
      },
    )
  }
  render(
    drawing(false, motion === "slow" ? "slow" : "instant"),
  )
  await openChild()
  await settle()
  expect(animate).not.toHaveBeenCalled()
  expect(panel("ai-usage")).toBeVisible()
})

test("grouped dashboards keep the same mounted detail and restore their groups on Back", async () => {
  await page.viewport(1024, 600)
  const snapshot = pointsOverviewFixture()
  snapshot.view = {
    ...snapshot.view,
    layout: "grid",
    panels: snapshot.view.panels.map((item) => ({
      ...item,
      settings: {
        ...item.settings,
        homeGroup: item.id,
        homeGroupTitle: item.specId,
      },
    })),
  }
  render(
    <main class="platform">
      <DisplayComposition
        snapshot={snapshot}
        isConnected
        onAction={async () => undefined}
      />
    </main>,
  )
  // Grouped dashboards are content-sized; this fixture gives Points a display-sized slot.
  await waitFor(() =>
    expect(panel("kids-points")).not.toBeNull(),
  )
  panel("kids-points").style.minHeight = "400px"
  await screen.findByRole("button", {
    name: "View Robin's tasks today",
  })
  const points = panel("kids-points")
  await openChild()
  await settle()
  await waitFor(() => {
    expect(panel("ai-usage")).toBeVisible()
    expect(
      points.getBoundingClientRect().height,
    ).toBeGreaterThan(500)
    expect(
      panel("ai-usage").getBoundingClientRect().left,
    ).toBeGreaterThan(points.getBoundingClientRect().right)
  })
  await userEvent.click(
    screen.getByRole("button", {
      name: "Back to all children",
    }),
  )
  await settle()
  expect(panel("kids-points")).toBe(points)
  expect(
    document.querySelector("[data-navigation-focus]"),
  ).toBeNull()
  expect(
    document.querySelector(".home-group-title"),
  ).toBeVisible()
})
