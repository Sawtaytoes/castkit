import { expect, test } from "vitest"
import { normalizeMealieRecipe } from "./mealie.ts"

test("uses Mealie's display quantities verbatim and retains recipe headings and notes", () => {
  const recipe = normalizeMealieRecipe(
    {
      name: "Skillet",
      slug: "skillet",
      recipeIngredient: [
        {
          display: "½ teaspoon red pepper flakes",
          quantity: 0.5,
          food: { name: "flakes" },
        },
      ],
      recipeInstructions: [
        { title: "Finish", text: "Stir, then serve." },
      ],
      notes: [{ title: "Storage", text: "Keep chilled." }],
    },
    "https://recipes.example",
  )
  expect(recipe.ingredients).toEqual([
    "½ teaspoon red pepper flakes",
  ])
  expect(recipe.instructions).toEqual([
    "Finish\nStir, then serve.",
  ])
  expect(recipe.notes).toEqual(["Storage\nKeep chilled."])
  expect(recipe.url).toBe(
    "https://recipes.example/g/home/r/skillet",
  )
})
