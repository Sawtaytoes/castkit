# Dependency security overrides

The `overrides` in `pnpm-workspace.yaml` move transitive packages to patched releases
when the package that depends on them has not published a fix. Each one is scoped as
narrowly as the advisory allows. Remove an override once the lockfile resolves a patched
version without it.

| Override | Advisory | Why it is needed | Remove when |
| --- | --- | --- | --- |
| `glob@>=9.0.0 <14.0.2` -> `^14.0.4` | GHSA-3g3m-2fjr-6pw4 | Only glob 14.0.2 has the fix. Storybook's docgen plugin declares glob 13. | Its parents declare glob 14. |
| `minimatch@>=7.0.0 <11.0.1` -> `^11.0.5` | GHSA-g3hv-75wg-m249 | Only minimatch 11.0.1 has the fix. ESLint, `@eslint/config-array`, `typescript-eslint`, and `@electron/asar` declare minimatch 10. | Its parents declare minimatch 11. |
| `undici@>=6.0.0 <6.29.1` -> `^6.29.1` | Several, fixed in 6.29.1 | node-gyp resolved 6.29.0. | node-gyp resolves 6.29.1 or later. |
| `undici@>=7.0.0 <7.30.1` -> `^7.30.1` | Several, fixed in 7.30.1 | `@electron/get` resolved 7.30.0. | `@electron/get` resolves 7.30.1 or later. |
| `source-map-js@<1.2.2` -> `^1.2.2` | GHSA-68fv-2mgg-jv7q | PostCSS and `@tailwindcss/node` resolved 1.2.1. | They resolve 1.2.2 or later. |
| `vite@>=8.0.0 <8.1.6` -> `^8.1.6` | Several, fixed in 8.1.6 | Vitest's own vite dependency stayed on 8.1.2. | The lockfile resolves 8.1.6 or later without it. |
| `satori>fflate` -> `0.7.5` | GHSA-px8p-9vwx-vf98 | Satori 0.56.1 pins fflate exactly to 0.7.3. 0.7.5 is a patch release on the same line, so Satori itself, and its local patch, stay unchanged. | Satori depends on fflate 0.7.5 or later. |
| `@scalar/types>zod` -> `^4.6.6` | Zod collection memory exhaustion, fixed in 4.6.6 | `@scalar/types` 0.16.0 declares `zod ^4.3.5` and resolved 4.4.3. This stays inside its declared range. | It resolves 4.6.6 or later. |

glob 14 and minimatch 11 are new majors for their parents. The parents call `glob`,
`globSync`, the `minimatch()` function, and `new Minimatch(...).match(path, partial)`
with `flipNegate`. The new majors keep all of these. They removed `makeRe`,
`Minimatch#regexp`, `AST`, `matchOne`, `slashSplit`, and `debug`, and none of the
parents calls them. `pnpm lint` exercises ESLint's matching.

Charcuterie made the same glob, minimatch, source-map-js, and undici decisions in its
[dependency security notes](https://github.com/Sawtaytoes/charcuterie/blob/master/docs/dependency-security.md).
