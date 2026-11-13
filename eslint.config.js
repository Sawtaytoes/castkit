// The house lint config, adopted whole from `@charcuterie/eslint-config`.
// Biome covers formatting and most linting; ESLint carries the type-aware
// and structural house rules (`id-length`, the `is`/`has` boolean prefix,
// one component per file, logical properties, the picker rule, and
// `test()`, not `it()`).
//
// CastKit adds only what is its own: where its React source lives, the zod
// `z` alias, the Storybook view catalogs, and the paths it never lints.
//
// `appDirectories` names the React packages. `@castkit/slatecast` is Preact
// under its own bundle budget and cannot use `@charcuterie/ui`, so the React
// and picker blocks do not reach it; the typed rules, the test rules and
// Biome's `/app` preset (which refuses a raw `<select>`) still do.

import {
  createAppConfig,
  MULTI_COMPONENT_FILE_GLOBS,
} from "@charcuterie/eslint-config"
import { defineConfig } from "eslint/config"

export default defineConfig(
  ...createAppConfig({
    tsconfigRootDir: import.meta.dirname,
    appDirectories: [
      "packages/admin",
      "packages/desktop",
      "packages/views",
      "packages/web",
    ],
    ignores: [
      ".worktrees/**",
      "**/render-output/**",
      "**/scripts/**",
      "docs/**",
      "test-results/**",
    ],
    storyFiles: [
      ...MULTI_COMPONENT_FILE_GLOBS,
      // Storybook-only preview helpers: catalogs that map many view names
      // to element builders are multi-component by nature, like the
      // stories they feed.
      "packages/web/src/storybook/**/*.tsx",
    ],
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
)
