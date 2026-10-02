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
