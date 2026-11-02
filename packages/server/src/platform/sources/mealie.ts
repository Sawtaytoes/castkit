import type { SourceContext } from "@castkit/sdk/plugin"
import {
  type Recipe,
  recipeSchema,
} from "@castkit/sdk/recipe"
import { z } from "zod"
import {
  pollingSource,
  sourceRequest,
  sourceUrl,
} from "./http.ts"

const itemSchema = z.object({
  slug: z.string(),
  name: z.string(),
  recipeYield: z.string().nullish(),
  recipeServings: z.number().nullish(),
  orgURL: z.string().nullish(),
  recipeIngredient: z
    .array(
      z.object({
        display: z.string().nullish(),
        originalText: z.string().nullish(),
        title: z.string().nullish(),
        note: z.string().nullish(),
        quantity: z.number().nullish(),
        unit: z.object({ name: z.string() }).nullish(),
        food: z.object({ name: z.string() }).nullish(),
      }),
    )
    .default([]),
  recipeInstructions: z
    .array(
      z.object({
        title: z.string().nullish(),
        text: z.string(),
        summary: z.string().nullish(),
      }),
    )
    .default([]),
  notes: z
    .array(
      z.object({
        title: z.string().nullish(),
        text: z.string(),
      }),
    )
    .default([]),
})
export const normalizeMealieRecipe = (
  data: unknown,
  baseUrl: string,
): Recipe => {
  const item = itemSchema.parse(data)
  return recipeSchema.parse({
    slug: item.slug,
    name: item.name,
    url: sourceUrl({
      baseUrl,
      path: `/g/home/r/${encodeURIComponent(item.slug)}`,
    }),
    sourceUrl: item.orgURL ?? undefined,
    yieldText:
      item.recipeYield ||
      (item.recipeServings
        ? `${item.recipeServings} servings`
        : undefined),
    ingredients: item.recipeIngredient.map((ingredient) =>
      [
        ingredient.title,
        ingredient.display ||
          ingredient.originalText ||
          [
            ingredient.quantity ?? "",
            ingredient.unit?.name,
            ingredient.food?.name,
            ingredient.note,
          ]
            .filter(Boolean)
            .join(" "),
      ]
        .filter(Boolean)
        .join("\n"),
    ),
    instructions: item.recipeInstructions.map((step) =>
      [step.title, step.summary, step.text]
        .filter(Boolean)
        .join("\n"),
    ),
    notes: item.notes.map((note) =>
      [note.title, note.text].filter(Boolean).join("\n"),
    ),
  })
}
export const mealieRequest = (
  context: SourceContext,
  path: string,
  body?: unknown,
) =>
  sourceRequest({
    context,
    path,
    ...(body ? { method: "POST", body } : {}),
    headers: {
      Authorization: `Bearer ${context.secrets.apiToken ?? ""}`,
    },
    timeoutMilliseconds: body ? 120000 : 15000,
  })
export const readMealieRecipe = async (
  context: SourceContext,
  slug: string,
) =>
  normalizeMealieRecipe(
    await (
      await mealieRequest(
        context,
        `/api/recipes/${encodeURIComponent(slug)}`,
      )
    ).json(),
    String(context.source.settings.url),
  )
export const createMealieSource = (
  context: SourceContext,
) => {
  const poller = pollingSource({
    context,
    intervalSeconds: 300,
    poll: async () => {
      for (const channel of context.channels) {
        const recipe = await readMealieRecipe(
          context,
          String(channel.settings.slug ?? ""),
        )
        context.publish({
          channelId: channel.id,
          data: { recipe },
        })
      }
    },
  })
  return {
    ...poller,
    discover: async () =>
      (
        await mealieRequest(
          context,
          "/api/recipes?perPage=100&orderBy=name&orderDirection=asc",
        )
      ).json(),
  }
}
