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
  /** The whole recipe on one screen: ingredients, numbered steps, and notes. */
  isComplete: z.boolean().optional(),
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
/** A page that shows instructions, so the Instructions control can return to it. */
export const isInstructionPage = (page?: RecipePage) =>
  page?.isComplete === true ||
  page?.heading.startsWith("Step ") === true ||
  page?.heading === "Instructions missing"
/** The view's one-screen geometry, in multiples of the body font size. */
export const completeRecipeLayout = {
  lineHeight: 1.27,
  titleScale: 1.45,
  /** Average sans-serif glyph width, kept wide so the estimate errs toward paging. */
  glyphWidth: 0.58,
  ingredientShare: 0.34,
  columnGap: 1.2,
  itemGap: 0.3,
  stepGap: 0.75,
  noteScale: 0.8,
  largestFont: 22,
  smallestFont: 13,
}
const countLines = (
  value: string,
  width: number,
  fontSize: number,
) =>
  wrapRecipeText(
    value,
    Math.max(
      8,
      Math.floor(
        width /
          (fontSize * completeRecipeLayout.glyphWidth),
      ),
    ),
  ).length
/**
 * The largest body font that fits the whole recipe on one screen, or null
 * when the recipe needs pages. The view still shrinks to fit after layout.
 */
export const fitCompleteRecipe = (
  recipe: Recipe,
  width: number,
  height: number,
) => {
  const layout = completeRecipeLayout
  const padding = Math.round(
    Math.min(width, height) * 0.045,
  )
  const isWide = width >= height
  for (
    let fontSize = layout.largestFont;
    fontSize >= layout.smallestFont;
    fontSize -= 1
  ) {
    const line = Math.ceil(fontSize * layout.lineHeight)
    const inner = width - padding * 2
    const ingredientWidth = isWide
      ? Math.floor(inner * layout.ingredientShare)
      : inner
    const stepWidth = isWide
      ? inner -
        ingredientWidth -
        Math.ceil(fontSize * layout.columnGap * 2)
      : inner
    const titleSize = fontSize * layout.titleScale
    const titleLines = Math.min(
      2,
      countLines(
        recipe.name,
        inner - fontSize * 8,
        titleSize,
      ),
    )
    const header =
      Math.ceil(titleSize * 1.15) * titleLines + fontSize
    const heading = Math.ceil(fontSize * 1.6)
    const ingredients =
      heading +
      (recipe.ingredients.length
        ? recipe.ingredients
        : [""]
      )
        .map(
          (item) =>
            countLines(item, ingredientWidth, fontSize) *
              line +
            Math.ceil(fontSize * layout.itemGap),
        )
        .reduce((total, size) => total + size, 0)
    const noteSize = fontSize * layout.noteScale
    const steps =
      heading +
      (recipe.instructions.length
        ? recipe.instructions
        : [""]
      )
        .map(
          (step) =>
            countLines(
              step,
              stepWidth - fontSize * 1.6,
              fontSize,
            ) *
              line +
            Math.ceil(fontSize * layout.stepGap) +
            3,
        )
        .reduce((total, size) => total + size, 0) +
      (recipe.notes.length
        ? heading +
          recipe.notes
            .map(
              (note) =>
                countLines(note, stepWidth, noteSize) *
                  Math.ceil(noteSize * layout.lineHeight) +
                Math.ceil(fontSize * layout.itemGap),
            )
            .reduce((total, size) => total + size, 0)
        : 0)
    const body = isWide
      ? Math.max(ingredients, steps)
      : ingredients + steps
    if (header + body <= height - padding * 2)
      return { fontSize, padding }
  }
  return null
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
  const complete = fitCompleteRecipe(recipe, width, height)
  if (complete)
    return {
      pages: [
        {
          heading: "Recipe",
          lines: [],
          isComplete: true,
        },
      ] as RecipePage[],
      width,
      height,
      fontSize: complete.fontSize,
      lineHeight: Math.ceil(
        complete.fontSize * completeRecipeLayout.lineHeight,
      ),
      padding: complete.padding,
    }
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
