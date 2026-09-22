import { fireEvent, screen } from "@testing-library/preact"
import { describe, expect, test } from "vitest"
import { buildSnapshot } from "../__fixtures__/buildSnapshot.ts"
import { mountSlatecast } from "../__tests__/setup/mountSlatecast.tsx"

describe("Touch Test", () => {
  test("shows the coordinate Chromium reports for a physical tap", async () => {
    await mountSlatecast({
      snapshot: buildSnapshot({ view: "touch-test" }),
    })
    const testSurface = screen
      .getByRole("heading", { name: "Touch test" })
      .closest(".touch-test") as HTMLElement
    const rect = testSurface.getBoundingClientRect()

    fireEvent.pointerDown(testSurface, {
      clientX: rect.left + rect.width * 0.25,
      clientY: rect.top + rect.height * 0.75,
    })

    expect(screen.getByText(/Reported:/)).toHaveTextContent(
      "Reported: 25% across, 75% down",
    )
  })
})
