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

test("poster presentation keeps whole cards and reports the active jobs that do not fit", async () => {
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
    expect(screen.getAllByRole("img")).toHaveLength(2),
  )
  expect(
    screen.getByText("1 more active rip"),
  ).toBeVisible()
  expect(screen.queryByText("Movie 3")).toBeNull()
})
