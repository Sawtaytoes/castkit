import type { ContractData } from "@castkit/sdk/contracts"
import { render } from "@testing-library/preact"
import { expect, test } from "vitest"
import { pointsHistoryFixture } from "./fixtures.ts"
import { PointsHistoryView } from "./PointsHistoryView.tsx"
import "./platform.css"

const data = pointsHistoryFixture().channels.history
  .data as ContractData["points-history.v1"]
test("plots signed daily history and the selected child's dated goal", async () => {
  const view = render(
    <div style={{ width: "800px", height: "480px" }}>
      <PointsHistoryView
        data={data}
        settings={{ kidId: "robin" }}
      />
    </div>,
  )
  await expect
    .element(
      view.getByRole("img", { name: "Daily points" }),
    )
    .toBeVisible()
  await expect
    .element(view.getByText("Daily goal", { exact: true }))
    .toBeVisible()
  expect(
    view.container.querySelector("svg")?.textContent,
  ).toContain("2026-09-28: -50")
})
test("a missing child selection has an explicit empty state", async () => {
  const view = render(
    <PointsHistoryView
      data={data}
      settings={{ kidId: "missing" }}
    />,
  )
  await expect
    .element(view.getByText("No child matches this view."))
    .toBeVisible()
})
test("a short panel shows a compact summary and a stated chart limit", async () => {
  const view = render(
    <div style={{ width: "480px", height: "160px" }}>
      <PointsHistoryView data={data} settings={{}} />
    </div>,
  )
  await expect
    .element(view.getByText("Chart needs more space"))
    .toBeVisible()
  await expect
    .element(
      view.getByRole("img", {
        name: "Daily points",
        hidden: true,
      }),
    )
    .not.toBeVisible()
})
