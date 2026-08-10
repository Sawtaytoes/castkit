// Minimal ESLint config — Biome covers formatting and most linting.
// ESLint is kept only for structural rules that enforce AGENTS.md conventions
// Biome cannot express (they need TypeScript type information).
//
// The rules themselves now come from `@charcuterie/eslint-config`, the fleet's
// shared house rules, so `id-length`, the `is`/`has` boolean naming convention,
// one-component-per-file and `test()`-not-`it()` are identical here and in every
// other Charcuterie app. CastKit supplies only what is repo-shaped: which paths
// the React rules cover, and the zod `z` alias.

import {
  createLogicalPropertiesRules,
  createReactRules,
  createStoryOverrides,
  createTestRules,
  createTypedRules,
} from "@charcuterie/eslint-config"
import { defineConfig } from "eslint/config"

export default defineConfig(
  {
    ignores: [
      ".claude/worktrees/**",
      ".yarn/**",
      "**/build/**",
      "**/dist/**",
      "**/node_modules/**",
      "**/public/**",
      "**/render-output/**",
      "**/scripts/**",
      "**/storybook-static/**",
      "docs/**",
    ],
  },
  createTypedRules({
    tsconfigRootDir: import.meta.dirname,
  }),
  {
    // The shared `id-length` exceptions are `_` and `$`; CastKit's server
    // packages also use `z` as the conventional zod namespace alias.
    files: ["**/*.{ts,tsx}"],
    rules: {
      "id-length": [
        "error",
        {
          min: 2,
          exceptions: ["_", "$", "z"],
          properties: "never",
        },
      ],
    },
  },
  // AGENTS.md convention: one component per file in the view/web packages.
  createReactRules({
    files: ["packages/{views,web}/**/*.{ts,tsx}"],
  }),
  createStoryOverrides({
    files: [
      "packages/{views,web}/**/__fixtures__/**/*.{ts,tsx}",
      "packages/{views,web}/**/*.stories.tsx",
      // Storybook-only preview helpers: catalogs that map many view names to
      // element builders are multi-component by nature, like the stories they
      // feed.
      "packages/web/src/storybook/**/*.tsx",
    ],
  }),
  createTestRules({
    files: ["**/*.test.{ts,tsx}"],
  }),
  // Logical properties only, in the shipped component markup.
  createLogicalPropertiesRules({
    files: ["packages/{views,web}/**/*.tsx"],
  }),
)
