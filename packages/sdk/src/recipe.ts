import { z } from "zod"

const text = z.string().max(100000)
/** Plain recipe text, never executable markup or a generated rewrite. */
export const recipeSchema = z.object({
  slug: z.string().min(1).max(500),
  name: z.string().min(1).max(1000),
  url: z.string().url(),
  sourceUrl: z.string().optional(),
  yieldText: z.string().optional(),
  ingredients: z.array(text).max(1000),
  instructions: z.array(text).max(1000),
  notes: z.array(text).max(1000),
})
export type Recipe = z.infer<typeof recipeSchema>
export const recipePageSchema = z.object({
  heading: z.string(),
  lines: z.array(z.string()),
})
export type RecipePage = z.infer<typeof recipePageSchema>
export const recipeDisplaySchema = z.object({
  recipe: recipeSchema,
  page: recipePageSchema,
  pageIndex: z.number().int().nonnegative(),
  pageCount: z.number().int().positive(),
  width: z.number().positive(),
  height: z.number().positive(),
  fontSize: z.number().positive(),
  lineHeight: z.number().positive(),
  padding: z.number().nonnegative(),
})
export type RecipeDisplay = z.infer<
  typeof recipeDisplaySchema
>

/** Conservative monospace cells: wide glyphs consume two, combining marks none. */
const cells = (letter: string) =>
  /\p{Mark}/u.test(letter)
    ? 0
    : /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7af\uf900-\ufaff\ufe10-\ufe6f\uff00-\uff60]|\p{Extended_Pictographic}/u.test(
          letter,
        )
      ? 2
      : 1
export const wrapRecipeText = (
  value: string,
  columns: number,
) => {
  const lines: string[] = []
  for (const paragraph of value
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, "    ")
    .split("\n")) {
    let line = ""
    let used = 0
    for (const letter of Array.from(paragraph)) {
      const size = cells(letter)
      while (used + size > columns && line) {
        const boundary = line.lastIndexOf(" ") + 1
        const splitAt =
          boundary > 0 ? boundary : line.length
        lines.push(line.slice(0, splitAt))
        line = line.slice(splitAt)
        used = Array.from(line).reduce(
          (total, character) => total + cells(character),
          0,
        )
      }
      line += letter
      used += size
    }
    lines.push(line)
  }
  return lines
}
/** One canonical page sequence, sized for the target, shared with phone controls. */
export const paginateRecipe = (
  recipe: Recipe,
  width: number,
  height: number,
) => {
  if (width < 320 || height < 240)
    throw new Error(
      "Recipes need at least 320 × 240 pixels.",
    )
  const fontSize = Math.max(
    16,
    Math.min(26, Math.floor(Math.min(width, height) / 22)),
  )
  const lineHeight = Math.ceil(fontSize * 1.45)
  const padding = Math.ceil(fontSize * 1.2)
  const columns = Math.max(
    8,
    Math.floor((width - padding * 2) / (fontSize * 0.68)),
  )
  // Reserve two title lines, one section line, a footer, and generous gaps.
  const rows = Math.max(
    1,
    Math.floor(
      (height -
        padding * 2 -
        lineHeight * 4 -
        fontSize * 2) /
        lineHeight,
    ),
  )
  const pages: RecipePage[] = []
  const section = (heading: string, value: string) => {
    const lines = wrapRecipeText(value, columns)
    for (
      let offset = 0;
      offset < lines.length;
      offset += rows
    )
      pages.push({
        heading: offset
          ? `${heading} · continued`
          : heading,
        lines: lines.slice(offset, offset + rows),
      })
  }
  section(
    "Ingredients",
    recipe.ingredients.length
      ? recipe.ingredients
          .map((item) => `• ${item}`)
          .join("\n")
      : "No ingredients saved. Check the original recipe.",
  )
  recipe.instructions.forEach(
    (step, index) =>
      void section(
        `Step ${index + 1} of ${recipe.instructions.length}`,
        step,
      ),
  )
  if (!recipe.instructions.length)
    section(
      "Instructions missing",
      "No instructions saved. Check the original recipe.",
    )
  recipe.notes.forEach(
    (note, index) =>
      void section(`Note ${index + 1}`, note),
  )
  return {
    pages,
    width,
    height,
    fontSize,
    lineHeight,
    padding,
  }
}
