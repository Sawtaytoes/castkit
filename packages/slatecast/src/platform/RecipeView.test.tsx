import { paginateRecipe } from "@castkit/sdk/recipe"
import { render, waitFor } from "@testing-library/preact"
import { expect, test } from "vitest"
import { page } from "vitest/browser"
import { RecipeView } from "./RecipeView.tsx"

test.each([
  { width: 800, height: 480 },
  { width: 960, height: 540 },
  { width: 480, height: 800 },
])("static recipe pages fit $width × $height with no scroll or touch", async ({
  width,
  height,
}) => {
  await page.viewport(width, height)
  const recipe = {
    slug: "skillet",
    name: "Lemon chickpea skillet",
    url: "https://recipes.example/g/home/r/skillet",
    ingredients: ["2 cans chickpeas", "1 lemon"],
    instructions: [
      "Stir carefully and keep simmering. ".repeat(100),
    ],
    notes: [],
  }
  const { pages, ...geometry } = paginateRecipe(
    recipe,
    width,
    height,
  )
  const result = render(
    <div
      style={{ width, height, position: "fixed", inset: 0 }}
    >
      <RecipeView
        data={{
          ...geometry,
          recipe,
          page: pages[1]!,
          pageIndex: 1,
          pageCount: pages.length,
        }}
      />
    </div>,
  )
  await waitFor(() =>
    expect(
      result
        .getByLabelText("Recipe page")
        .getBoundingClientRect().width,
    ).toBe(width),
  )
  const article = result.getByLabelText("Recipe page")
  expect(article.scrollHeight).toBeLessThanOrEqual(
    article.clientHeight,
  )
  expect(article.scrollWidth).toBeLessThanOrEqual(
    article.clientWidth,
  )
  expect(
    article.querySelectorAll("button, input, textarea")
      .length,
  ).toBe(0)
  expect(
    article.querySelector("footer")?.getBoundingClientRect()
      .bottom,
  ).toBeLessThanOrEqual(height)
})
