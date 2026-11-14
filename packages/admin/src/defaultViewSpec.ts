import type { ViewSpec } from "./platformApi.ts"

/**
 * The component a new view or a new panel starts with: the first one that
 * needs no channel, so a fresh view saves as soon as it has a name. Only
 * when every component needs a channel is the first one used.
 *
 * It was `viewSpecs[0]` until 2026-11-14. Recipes (#339) put the Recipe
 * component first in the catalog, and it requires a Recipe channel, so on
 * an install without Mealie every new view refused to save with "Choose a
 * Recipe channel for Recipe." Before #339 the first component was the Clock.
 */
export const defaultViewSpec = (viewSpecs: ViewSpec[]) =>
  viewSpecs.find(
    (spec) =>
      !spec.inputs.some((input) => input.isRequired),
  ) ?? viewSpecs[0]
