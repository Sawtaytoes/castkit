import type { ContractData } from "@castkit/sdk/contracts"
import {
  render,
  screen,
  waitFor,
} from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { expect, test, vi } from "vitest"
import { page } from "vitest/browser"
import "../styles.css"
import "./platform.css"
import { compositionFixture } from "./fixtures.ts"
import { RipDeckView } from "./RipDeckView.tsx"

test("three rips retain their posters when every complete card fits", async () => {
  const original = compositionFixture.channels.rips
    ?.data as ContractData["rip-deck.v1"]
  const data = {
    ...original,
    bays: Array.from({ length: 3 }, (_unused, index) => ({
      ...original.bays[0],
      id: `bay-${index}`,
      name: `Bay ${index + 1}`,
      title: `Movie ${index + 1}`,
      posterUrl: "/sample-poster.svg",
    })),
  }
  render(
    <main
      class="platform"
      style={{ inlineSize: "480px", blockSize: "280px" }}
    >
      <section
        class="platform-panel"
        style={{ flex: 1, padding: "12px" }}
      >
        <RipDeckView
          data={data}
          settings={{ presentation: "posters" }}
          isControlEnabled
          onAction={vi.fn(async () => undefined)}
        />
      </section>
    </main>,
  )
  await waitFor(() =>
    expect(screen.getAllByRole("img")).toHaveLength(3),
  )
  expect(screen.queryByText(/more active rip/)).toBeNull()
  expect(screen.getByText("Movie 3")).toBeVisible()
})

test("dense poster requests keep all jobs and hide artwork instead", async () => {
  const original = compositionFixture.channels.rips
    ?.data as ContractData["rip-deck.v1"]
  const data = {
    ...original,
    bays: Array.from({ length: 9 }, (_unused, index) => ({
      ...original.bays[0]!,
      id: `bay-${index}`,
      name: `Bay ${index + 1}`,
      title: `Movie ${index + 1}`,
      posterUrl: "/sample-poster.svg",
    })),
  }
  render(
    <main
      class="platform"
      style={{ inlineSize: "480px", blockSize: "320px" }}
    >
      <section
        class="platform-panel"
        style={{ flex: 1, padding: "12px" }}
      >
        <RipDeckView
          data={data}
          settings={{ presentation: "posters" }}
          isControlEnabled
          onAction={vi.fn(async () => undefined)}
        />
      </section>
    </main>,
  )
  await waitFor(() => {
    expect(screen.queryAllByRole("img")).toHaveLength(0)
    expect(screen.getByText("Movie 9")).toBeVisible()
    const rows = document.querySelector(
      ".platform-rip-rows",
    ) as HTMLElement
    expect(rows.scrollHeight).toBeLessThanOrEqual(
      rows.clientHeight + 1,
    )
  })
})

test("jobs without artwork use their space for rip status and preserve real warnings", async () => {
  const original = compositionFixture.channels.rips
    ?.data as ContractData["rip-deck.v1"]
  render(
    <main
      class="platform"
      style={{ inlineSize: "480px", blockSize: "280px" }}
    >
      <section
        class="platform-panel"
        style={{ flex: 1, padding: "12px" }}
      >
        <RipDeckView
          data={{
            ...original,
            bays: [
              {
                ...original.bays[0]!,
                id: "healthy",
                name: "Bay 1",
                title: "Healthy rip",
                phase: "Reading disc",
              },
              {
                ...original.bays[0]!,
                id: "error",
                name: "Bay 2",
                title: "Troubled rip",
                problemText: "A sector could not be read.",
              },
            ],
          }}
          settings={{ presentation: "posters" }}
          isControlEnabled
          onAction={vi.fn(async () => undefined)}
        />
      </section>
    </main>,
  )
  await waitFor(() => {
    expect(
      screen.getByRole("button", { name: /Healthy rip/ }),
    ).not.toHaveAttribute("data-warning", "true")
    expect(
      screen.getByRole("button", { name: /Troubled rip/ }),
    ).toHaveAttribute("data-warning", "true")
    expect(screen.getByText("Reading disc")).toBeVisible()
    expect(
      screen.getByText("A sector could not be read."),
    ).toBeVisible()
    expect(screen.queryByText("No artwork")).toBeNull()
    expect(
      document.querySelector(".platform-rip-poster"),
    ).toBeNull()
    expect(
      document.querySelector(".platform-rips"),
    ).toHaveAttribute("data-presentation", "rows")
  })
})

test("unpadded slot numbers leave title and progress readable in a narrow rail", async () => {
  const original = compositionFixture.channels.rips
    ?.data as ContractData["rip-deck.v1"]
  render(
    <main
      class="platform"
      style={{
        inlineSize: "300px",
        blockSize: "300px",
        padding: "12px",
      }}
    >
      <section
        class="platform-panel"
        style={{ flex: 1, padding: "12px" }}
      >
        <RipDeckView
          data={{
            ...original,
            bays: [3, 4].map((percent) => ({
              ...original.bays[0]!,
              id: `bay-${percent}`,
              name: `0${percent} - Example Optical Drive`,
              slotNumber: percent,
              title: "Sample film",
              percent,
              phase: "Copying file",
            })),
          }}
          settings={{ presentation: "posters" }}
          isControlEnabled
          onAction={vi.fn(async () => undefined)}
        />
      </section>
    </main>,
  )
  await document.fonts.ready
  await waitFor(() => {
    const rows = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".platform-rip-row",
      ),
    )
    expect(rows).toHaveLength(2)
    rows.forEach((row) => {
      const name = row.querySelector<HTMLElement>(
        ".platform-rip-number",
      )!
      const title = row.querySelector<HTMLElement>(
        ".platform-rip-title",
      )!
      const percent = row.querySelector<HTMLElement>(
        ":scope > strong",
      )!
      const bounds = row.getBoundingClientRect()
      expect(name.textContent).toBe(
        String(rows.indexOf(row) + 3),
      )
      expect(name.clientWidth).toBeLessThan(50)
      expect(
        name.getBoundingClientRect().right,
      ).toBeLessThanOrEqual(
        title.getBoundingClientRect().left,
      )
      expect(
        name.getBoundingClientRect().right,
      ).toBeLessThanOrEqual(
        percent.getBoundingClientRect().left,
      )
      expect(title.clientWidth).toBeGreaterThan(120)
      expect(
        title.getBoundingClientRect().right,
      ).toBeLessThanOrEqual(
        percent.getBoundingClientRect().left,
      )
      expect(
        title.getBoundingClientRect().bottom,
      ).toBeLessThanOrEqual(bounds.bottom)
      expect(
        percent.getBoundingClientRect().right,
      ).toBeLessThanOrEqual(bounds.right)
    })
  })
})

test("a detail header keeps Back usable inside its small composed panel", async () => {
  await page.viewport(1024, 600)
  const original = compositionFixture.channels.rips
    ?.data as ContractData["rip-deck.v1"]
  const onAction = vi.fn(async () => undefined)
  const user = userEvent.setup()
  const { container } = render(
    <main
      class="platform"
      style={{
        inlineSize: "280px",
        blockSize: "280px",
        padding: "12px",
      }}
    >
      <section
        class="platform-panel"
        style={{ flex: 1, padding: "12px" }}
      >
        <h2 class="platform-panel-title">Rip Deck</h2>
        <RipDeckView
          data={{
            ...original,
            bays: [
              {
                ...original.bays[0]!,
                id: "bay-3",
                slotNumber: 3,
                name: "03 - Example Optical Drive",
                title: "Sample film",
                phase: "Copying file",
                percent: 78,
                remainingSeconds: 420,
              },
              {
                ...original.bays[0]!,
                id: "bay-4",
                slotNumber: 4,
                name: "04 - Other Optical Drive",
                title: "Another film",
                percent: 70,
              },
            ],
          }}
          isControlEnabled
          onAction={onAction}
        />
      </section>
    </main>,
  )
  await user.click(
    screen.getByRole("button", { name: /Sample film/ }),
  )
  const back = screen.getByRole("button", { name: "Back" })
  expect(back).toBeVisible()
  expect(
    screen.getByRole("heading", {
      name: "3 · Sample film",
    }),
  ).toBeVisible()
  expect(screen.getByText("7 minutes left")).toBeVisible()
  expect(screen.queryByText(/Optical Drive/)).toBeNull()
  expect(
    screen.queryByRole("button", { name: "Open" }),
  ).toBeNull()
  expect(
    screen.queryByText(/Tray controls are unavailable/),
  ).toBeNull()
  const panel = container.querySelector<HTMLElement>(
    ".platform-panel",
  )!
  const bounds = panel.getBoundingClientRect()
  const backBounds = back.getBoundingClientRect()
  expect(backBounds.top).toBeGreaterThanOrEqual(bounds.top)
  expect(backBounds.bottom).toBeLessThanOrEqual(
    bounds.bottom,
  )
  expect(backBounds.right).toBeLessThanOrEqual(bounds.right)
  const cancel = screen.getByRole("button", {
    name: "Cancel rip",
  })
  expect(
    cancel.getBoundingClientRect().bottom,
  ).toBeLessThanOrEqual(bounds.bottom)
  expect(panel.scrollHeight).toBeLessThanOrEqual(
    panel.clientHeight + 1,
  )
  await user.click(back)
  expect(
    screen.getByRole("button", { name: /Another film/ }),
  ).toBeVisible()
  expect(
    screen.getByRole("button", { name: /Sample film/ }),
  ).toBeVisible()
  expect(onAction).not.toHaveBeenCalled()
})

test("older channels keep slot labels stable when idle bays are filtered", async () => {
  const original = compositionFixture.channels.rips
    ?.data as ContractData["rip-deck.v1"]
  render(
    <RipDeckView
      data={{
        ...original,
        bays: [
          {
            ...original.bays[0]!,
            id: "idle",
            name: "01 - Optical Drive",
            state: "idle",
          },
          {
            ...original.bays[0]!,
            id: "active",
            name: "03 - Optical Drive",
            title: "Active film",
          },
          {
            ...original.bays[0]!,
            id: "tenth",
            name: "10 - Optical Drive",
            title: "Tenth film",
          },
        ],
      }}
      isControlEnabled
      onAction={vi.fn(async () => undefined)}
    />,
  )
  expect(
    screen.getByRole("button", { name: /^3 Active film/ }),
  ).toBeVisible()
  expect(
    screen.getByRole("button", { name: /^10 Tenth film/ }),
  ).toBeVisible()
  expect(screen.queryByText(/Optical Drive/)).toBeNull()
})

test("long titles and genuine errors leave the detail return outside scrolling content", async () => {
  await page.viewport(1024, 600)
  const original = compositionFixture.channels.rips
    ?.data as ContractData["rip-deck.v1"]
  const { container } = render(
    <main
      class="platform"
      style={{
        inlineSize: "280px",
        blockSize: "220px",
        padding: "12px",
      }}
    >
      <section
        class="platform-panel"
        style={{ flex: 1, padding: "12px" }}
      >
        <h2 class="platform-panel-title">Rip Deck</h2>
        <RipDeckView
          data={{
            ...original,
            alerts: [
              {
                message:
                  "Drive disconnected during the rip. ".repeat(
                    20,
                  ),
                driveIds: ["bay-one"],
              },
            ],
            bays: [
              {
                ...original.bays[0]!,
                title: "A very long film title ".repeat(10),
                problemText:
                  "A sector could not be read. ".repeat(20),
              },
            ],
          }}
          isControlEnabled
          onAction={vi.fn(async () => undefined)}
        />
      </section>
    </main>,
  )
  const user = userEvent.setup()
  await user.click(
    screen.getByRole("button", {
      name: /A very long film title/,
    }),
  )
  const panel = container.querySelector<HTMLElement>(
    ".platform-panel",
  )!
  const back = screen.getByRole("button", { name: "Back" })
  const content = container.querySelector<HTMLElement>(
    ".platform-rip-detail-content",
  )!
  content.scrollTop = content.scrollHeight
  expect(content.scrollHeight).toBeGreaterThan(
    content.clientHeight,
  )
  expect(
    back.getBoundingClientRect().top,
  ).toBeGreaterThanOrEqual(
    panel.getBoundingClientRect().top,
  )
  expect(
    back.getBoundingClientRect().bottom,
  ).toBeLessThanOrEqual(
    panel.getBoundingClientRect().bottom,
  )
  expect(panel.scrollHeight).toBeLessThanOrEqual(
    panel.clientHeight + 1,
  )
  await user.click(back)
  expect(
    screen.queryByRole("button", { name: "Back" }),
  ).toBeNull()
})
