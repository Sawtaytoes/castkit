import { expect, test } from "vitest"
import {
  fitCompleteRecipe,
  isInstructionPage,
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
    {
      ...recipe,
      ingredients: Array(80).fill("1 cup flour"),
      instructions: [],
    },
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
test("a recipe that fits gets one complete page at the largest font that fits", () => {
  const result = paginateRecipe(recipe, 800, 480)
  expect(result.pages).toEqual([
    { heading: "Recipe", lines: [], isComplete: true },
  ])
  expect(result.fontSize).toBe(22)
  expect(isInstructionPage(result.pages[0])).toBe(true)
})
test("a longer recipe shrinks the font before it falls back to pages", () => {
  const medium = {
    ...recipe,
    ingredients: Array(10).fill("1 cup packed brown sugar"),
    instructions: Array(5).fill(
      "Beat butter, brown sugar, eggs, and vanilla with an electric mixer. Mix in mashed bananas.",
    ),
  }
  const fit = fitCompleteRecipe(medium, 800, 480)
  expect(fit?.fontSize).toBeLessThan(22)
  expect(fit?.fontSize).toBeGreaterThanOrEqual(13)
  expect(
    fitCompleteRecipe(
      {
        ...medium,
        instructions: Array(40).fill(
          medium.instructions[0]!,
        ),
      },
      800,
      480,
    ),
  ).toBeNull()
})
test("a title too long for the header sends the recipe to pages instead of hiding steps", () => {
  const { pages } = paginateRecipe(
    {
      ...recipe,
      name: "Large delicious recipe ".repeat(40),
      ingredients: ["1 lemon"],
      instructions: ["Serve."],
    },
    320,
    240,
  )
  expect(pages.length).toBeGreaterThan(1)
  expect(pages.some((page) => page.isComplete)).toBe(false)
})
test("wide letters that would wrap past a small screen send the recipe to pages", () => {
  const { pages } = paginateRecipe(
    {
      slug: "probe",
      name: "Recipe",
      url: "https://example.com",
      ingredients: ["WWWWW ".repeat(18)],
      instructions: ["Serve."],
      notes: [],
    },
    320,
    240,
  )
  expect(pages.some((page) => page.isComplete)).toBe(false)
})
test("keycap emoji count as wide glyphs", () => {
  const { pages } = paginateRecipe(
    {
      slug: "keycaps",
      name: "Recipe",
      url: "https://example.com",
      ingredients: ["1️⃣ 2️⃣ 3️⃣ ".repeat(24)],
      instructions: ["Serve."],
      notes: [],
    },
    320,
    240,
  )
  expect(pages.some((page) => page.isComplete)).toBe(false)
})
test("keycap emoji take two cells and never split from their marks across lines", () => {
  const lines = wrapRecipeText("1️⃣2️⃣3️⃣", 4)
  expect(lines).toEqual(["1️⃣2️⃣", "3️⃣"])
  expect(
    wrapRecipeText("é".normalize("NFD").repeat(3), 2),
  ).toEqual([
    "é".normalize("NFD").repeat(2),
    "é".normalize("NFD"),
  ])
})
