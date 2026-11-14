# Lint warnings fail CI, and every rule stays at the preset's level

- **Status:** Accepted
- **Date:** 2026-11-14
- **Type:** Tooling / CI
- **Supersedes:** —
- **Superseded by:** —

## Decision

1. Every Biome and ESLint rule runs at the level the Charcuterie presets give it. `biome.json`
   and `eslint.config.js` lower no rule.
2. CI's `lint` job runs `pnpm lint:biome` (`biome check --error-on-warnings`) and
   `pnpm lint:eslint` (`eslint . --max-warnings 0`). A warning fails CI like an error. The
   `lint` script that rewrites the tree stays as it is; it is not a gate.
3. A finding is fixed in the code. A per-line suppression is allowed only where an outside
   contract fixes the name or shape: a wire field, a stored key, or a third-party API. The
   comment states that contract.

## Context

On `master` at `e4397cd` Biome reported 242 warnings and no errors, and ESLint reported none.
Both tools exit 0 on a warning, so any new finding could merge. The warnings by rule:

| Rule | Count |
| --- | --- |
| `style/noNonNullAssertion` | 211 |
| `style/noDescendingSpecificity` | 21 |
| `suppressions/unused` | 4 |
| `performance/noAccumulatingSpread` | 3 |
| `correctness/noUnusedFunctionParameters` | 2 |
| `correctness/noUnusedVariables` | 1 |

Neither config lowers a rule from the preset. The preset turns on Biome's recommended rules,
and each rule above is a `warn` there by default.

The 2026-11-14 sweep fixed every one, and no suppression was added:

- `@castkit/sdk/defined` returns a value or throws a named error when it is `null` or
  `undefined`. It replaces each `x!` the types cannot prove. Where TypeScript lost a
  narrowing, a `const` keeps it instead (the view editor's intended viewport, the poster's
  content type).
- The CSS reorders move a rule past rules that cannot match the same element, or past rules
  with a different specificity, so the cascade gives every element the same values.
- The four unused suppressions are gone, and a preview page binds its buttons in its script
  rather than in `onclick` attributes.

After the sweep: 0 Biome warnings, 0 ESLint warnings.

## Why

A warning that does not fail CI is a defect that the gate accepts. Fixing the code, rather
than lowering a rule, keeps CastKit on the same standard as the rest of the fleet.

## Evidence

Owner, T3 Code thread "Fleet Code and Docket Audit", 2026-11-14, about the fleet's lint
warnings:

> We should fix all those lint warnings. I dunno why we have them in the first place.

The same change landed in `tally-marks` the same day
(`docs/decisions/2026-11-14-lint-warnings-fail-ci-and-rules-stay-at-the-preset-level.md`),
and `docket` has gated on warnings since 2026-08-28
(`docs/decisions/2026-08-28-lint-warnings-fail-the-ci-gate.md`).
