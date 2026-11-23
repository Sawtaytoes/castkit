import { render } from "@testing-library/preact"
import { expect, test } from "vitest"
import { aiUsageMarks } from "./__fixtures__/aiUsageMarks.ts"
import { AiUsageProviderIcon } from "./AiUsageProviderIcon.tsx"

test("a provider's mark is drawn from the producer's data", () => {
  const { container } = render(
    <AiUsageProviderIcon mark={aiUsageMarks.gemini} />,
  )
  const icon = container.querySelector(
    "svg.ai-usage-provider-icon",
  )
  expect(icon?.getAttribute("viewBox")).toBe("0 0 24 24")
  expect(icon?.getAttribute("fill")).toBe("currentColor")
  expect(icon?.getAttribute("aria-hidden")).toBe("true")
  expect(
    [...(icon?.querySelectorAll("path") ?? [])].map(
      (path) => path.getAttribute("d"),
    ),
  ).toEqual(aiUsageMarks.gemini.paths.map((path) => path.d))
})

test("a mark with a stroke width draws as a round outline", () => {
  const { container } = render(
    <AiUsageProviderIcon mark={aiUsageMarks.cursor} />,
  )
  const icon = container.querySelector("svg")
  expect(icon?.getAttribute("fill")).toBe("none")
  expect(icon?.getAttribute("stroke")).toBe("currentColor")
  expect(icon?.getAttribute("stroke-width")).toBe("1.6")
  expect(icon?.getAttribute("stroke-linecap")).toBe("round")
  expect(icon?.getAttribute("stroke-linejoin")).toBe(
    "round",
  )
  expect(icon?.querySelectorAll("path")).toHaveLength(2)
})

test("a two-tone mark keeps each path's opacity", () => {
  const { container } = render(
    <AiUsageProviderIcon
      mark={{
        viewBox: "0 0 16 20",
        paths: [
          { d: "M12 16H4V8H12V16Z", opacity: 0.45 },
          { d: "M12 4H4V16H12V4Z" },
        ],
      }}
    />,
  )
  const paths = container.querySelectorAll("path")
  expect(paths[0]?.getAttribute("opacity")).toBe("0.45")
  expect(paths[1]?.hasAttribute("opacity")).toBe(false)
})

test("a provider sent without a mark draws none", () => {
  const { container } = render(
    <AiUsageProviderIcon mark={undefined} />,
  )
  expect(container.innerHTML).toBe("")
})
