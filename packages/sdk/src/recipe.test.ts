import { expect, test } from "vitest"
import {
  paginateRecipe,
  type Recipe,
  wrapRecipeText,
} from "./recipe.ts"

const recipe: Recipe = {
  slug: "skillet",
  name: "Lemon chickpea skillet",
  url: "https://recipes.example/g/home/r/skillet",
  ingredients: ["2 cans chickpeas", "1 lemon"],
  instructions: [
    "Warm the chickpeas. Add lemon juice. Serve warm.",
  ],
  notes: [],
}
test("long steps and ingredient lists retain every character across bounded pages", () => {
  const step =
    "Stir gently; keep all quantities unchanged. ".repeat(
      100,
    )
  const result = paginateRecipe(
    { ...recipe, instructions: [step] },
    800,
    480,
  )
  expect(result.pages.length).toBeGreaterThan(10)
  expect(
    result.pages
      .filter((page) => page.heading.startsWith("Step"))
      .flatMap((page) => page.lines)
      .join(""),
  ).toBe(step)
  expect(
    result.pages.every(
      (page) =>
        page.lines.length * result.lineHeight <=
        result.height -
          result.padding * 2 -
          result.lineHeight * 4 -
          result.fontSize * 2,
    ),
  ).toBe(true)
})
test("unbroken words, wide glyphs, and newlines cannot create an overflowing line", () => {
  expect(wrapRecipeText("abcdefghijkl", 4)).toEqual([
    "abcd",
    "efgh",
    "ijkl",
  ])
  expect(wrapRecipeText("界界界", 4)).toEqual([
    "界界",
    "界",
  ])
  expect(wrapRecipeText("a\nb", 4)).toEqual(["a", "b"])
})
test("incomplete recipes report missing instructions rather than generating directions", () => {
  const { pages } = paginateRecipe(
    { ...recipe, instructions: [] },
    800,
    480,
  )
  expect(pages.at(-1)?.heading).toBe("Instructions missing")
})
test("tiny displays refuse a recipe instead of shrinking below a readable size", () => {
  expect(() => paginateRecipe(recipe, 250, 122)).toThrow(
    "at least",
  )
})
