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

const bananaCake = {
  slug: "banana-bread-snack-cake",
  name: "Banana Bread Snack Cake",
  url: "https://recipes.example/g/home/r/banana-bread-snack-cake",
  yieldText: "8–10 servings",
  ingredients: [
    "4–5 very ripe bananas, mashed",
    "2 eggs",
    "1¾ cups all-purpose flour",
    "1 tsp baking soda",
    "1 cup packed brown sugar",
    "¼ cup granulated sugar",
    "½ tsp salt",
    "2 tsp vanilla extract",
    "½ cup chopped pecans (optional)",
    "½ cup butter (1 stick), melted and cooled",
  ],
  instructions: [
    "Heat oven to 350°. Spray an 8- or 9-inch square pan with baking spray, or line with parchment.",
    "Beat butter, brown sugar, eggs, and vanilla with an electric mixer. Mix in mashed bananas.",
    "Whisk flour, baking soda, and salt in a bowl. Stir into the wet mixture just until combined. Fold in pecans, if using.",
    "Pour into the pan. Sprinkle the granulated sugar evenly over the top.",
    "Bake 45–50 minutes, until a toothpick in the center comes out clean. Cool slightly in the pan on a rack; cut into squares.",
  ],
  notes: [
    "Very ripe, heavily speckled bananas give the most flavor.",
  ],
}
test.each([
  { width: 800, height: 480 },
  { width: 960, height: 540 },
  { width: 480, height: 800 },
])("a recipe that fits shows every ingredient and step on one $width × $height screen", async ({
  width,
  height,
}) => {
  await page.viewport(width, height)
  const { pages, ...geometry } = paginateRecipe(
    bananaCake,
    width,
    height,
  )
  expect(pages).toHaveLength(1)
  const result = render(
    <div
      style={{ width, height, position: "fixed", inset: 0 }}
    >
      <RecipeView
        data={{
          ...geometry,
          recipe: bananaCake,
          page: pages[0]!,
          pageIndex: 0,
          pageCount: 1,
        }}
      />
    </div>,
  )
  const article = result.getByLabelText("Recipe page")
  await waitFor(() =>
    expect(article.getBoundingClientRect().width).toBe(
      width,
    ),
  )
  expect(article.scrollHeight).toBeLessThanOrEqual(
    article.clientHeight + 1,
  )
  expect(article.scrollWidth).toBeLessThanOrEqual(
    article.clientWidth,
  )
  for (const text of [
    ...bananaCake.ingredients,
    ...bananaCake.instructions,
    ...bananaCake.notes,
  ])
    expect(article.textContent).toContain(text)
  const steps = Array.from(
    article.querySelectorAll<HTMLElement>(
      "[data-recipe-step]",
    ),
  )
  expect(
    steps.map((step) => {
      const style = getComputedStyle(step)
      return style.borderBottomStyle === "none"
        ? ""
        : style.borderBottomColor
    }),
  ).toEqual([
    "rgb(206, 36, 38)",
    "rgb(31, 30, 175)",
    "rgb(29, 173, 35)",
    "rgb(232, 223, 36)",
    "",
  ])
  for (const step of steps)
    expect(
      step.getBoundingClientRect().bottom,
    ).toBeLessThanOrEqual(height)
})
