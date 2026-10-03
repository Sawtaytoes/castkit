import type { ContractData } from "@castkit/sdk/contracts"
import {
  render,
  screen,
  waitFor,
} from "@testing-library/preact"
import { expect, test, vi } from "vitest"
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

test("long drive names cannot crowd the title or overlap progress in a narrow rail", async () => {
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
              name: `${percent} - Example Optical Drive`,
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
      expect(
        title.getBoundingClientRect().top,
      ).toBeGreaterThanOrEqual(
        name.getBoundingClientRect().bottom,
      )
      expect(
        name.getBoundingClientRect().right,
      ).toBeLessThanOrEqual(
        percent.getBoundingClientRect().left,
      )
      expect(title.clientWidth).toBeGreaterThan(150)
      expect(
        title.getBoundingClientRect().bottom,
      ).toBeLessThanOrEqual(bounds.bottom)
      expect(
        percent.getBoundingClientRect().right,
      ).toBeLessThanOrEqual(bounds.right)
    })
  })
})
