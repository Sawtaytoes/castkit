import { WEATHER_CONDITION_CODES } from "@castkit/shared/viewData/types"
import { render } from "@testing-library/preact"
import { describe, expect, test } from "vitest"
import { WeatherMark } from "./WeatherMark.tsx"

describe("WeatherMark", () => {
  test.each(
    WEATHER_CONDITION_CODES,
  )("draws %s as stroked paths inside the 24-unit box", (condition) => {
    const { container } = render(
      <WeatherMark condition={condition} />,
    )
    const svg = container.querySelector("svg")
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute("data-condition")).toBe(
      condition,
    )
    expect(svg?.getAttribute("fill")).toBe("none")
    expect(svg?.getAttribute("aria-hidden")).toBe("true")
    expect(
      svg?.querySelectorAll("path").length,
    ).toBeGreaterThan(0)

    // Nothing drawn reaches past the box the marks were designed in: a
    // mark clipped at the top is how the fog and windy marks first shipped
    // in the mockup.
    const box = (svg as SVGSVGElement).getBBox()
    expect(box.y).toBeGreaterThanOrEqual(0.5)
    expect(box.y + box.height).toBeLessThanOrEqual(23.5)
    expect(box.x).toBeGreaterThanOrEqual(0.5)
    expect(box.x + box.width).toBeLessThanOrEqual(23.5)
  })

  test("takes a class for the surface that places it", () => {
    const { container } = render(
      <WeatherMark
        condition="sunny"
        class="calendar-mark"
      />,
    )
    expect(
      container.querySelector("svg")?.getAttribute("class"),
    ).toBe("calendar-mark")
  })
})
