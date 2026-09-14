# The Pi Python and the ESPHome C++ are linted, and vendored components are not

- **Status:** Accepted
- **Date:** 2026-09-14
- **Type:** Tooling / CI
- **Supersedes:** —
- **Superseded by:** —

## Decision

**CI gates `device-client/`'s Python and C++, through the `nativeLint` job, and it never
touches `it8951e/` or `m5paper/`.**

```yaml
nativeLint:
  uses: Sawtaytoes/charcuterie/.github/workflows/shared-native-lint.yml@workflows-v1
  with:
    pythonExclude: >-
      device-client/esphome/components/it8951e
      device-client/esphome/components/m5paper
    cppExclude: >-
      device-client/esphome/components/it8951e
      device-client/esphome/components/m5paper
```

The config lives in Charcuterie, not here
([decision](https://github.com/Sawtaytoes/charcuterie/blob/master/docs/decisions/2026-09-14-shared-python-and-c-lint-config-lives-in-charcuterie-ci.md)).
`remote-display-deploy` now needs it, so a Pi client whose Python fails lint does not ship.

## Context

`yarn lint` is Biome and ESLint. Both read TypeScript. This repo also ships:

| Not TypeScript | Where | Runs on |
| --- | --- | --- |
| Python | `device-client/inkcast_receiver.py`, `inkcast_buttons.py`, `remote-display/` (11 files) | The Raspberry Pis |
| Python | `device-client/esphome/components/*/` | The ESPHome build host |
| C++ | `device-client/esphome/components/castkit_display/castkit_display.h` | An ESP32 |

None of it was linted by anything, in this repo or any other in the fleet.

## Why

**The gate is in CI, not in `yarn lint`.** A Python linter in a Yarn script would need
Python installed to run `yarn lint` at all, and eight of this repo's contributors' worth of
tooling is Node. CI already installs Python for `remote-display-tests`.

**The vendored components are excluded because `PATCHES.md` is a diff against upstream.**
`it8951e/` and `m5paper/` are copied from `ilia-ae/m5paper_esphome` and patched, and every
patch in `PATCHES.md` is stated as a diff against that upstream. A formatter would rewrite
every line of both, destroy the ability to check a patch, and turn the next upstream pull
into a conflict in every file.

⚠️ **An ESPHome component is C++ AND Python**, which is why both exclusions name the same
two directories. This was not obvious. The first ruff pass over `device-client/` reformatted
the vendored `it8951e/display.py` and `m5paper/__init__.py`, and the diff had to be
reverted.

**`castkit_display/` is ours and is linted.** 260 lines. The C++ gate has very little to do
today. It exists so the next component lands formatted instead of being reformatted later.

## Evidence

Bringing the repo to green, with `ruff 0.14.5` and the shared config:

- 22 findings, 17 fixed by `ruff check --fix`.
- The remaining five were fixed by hand rather than with `--unsafe-fixes`: one `SIM212`
  (`'system' if not ca_file else ca_file` → `ca_file if ca_file else 'system'`) and four
  `SIM105` (`try`/`except`/`pass` → `contextlib.suppress`).
- `ruff format` reformatted 15 of 16 files.
- Every file still compiles: `python3 -m py_compile` over all of `device-client/`.
- `python3 -m unittest discover -s device-client/remote-display` gives the **same** result
  before and after — 9 tests run, 3 loader errors from `aiohttp`, `PIL` and `playwright`
  missing in the agent sandbox. CI installs them and runs the full set.

`castkit_display.h` was reformatted with `clang-format@1.8.0` (LLVM 15) and the change was
proved to be safe rather than assumed: stripping comments and all whitespace from the old
and new files leaves two token streams that differ **only** by 20 braces — 10 single
statement bodies that `InsertBraces` wrapped. Nothing else in the file moved.

Two config values came out of that run and were changed in Charcuterie before this landed:

- `AccessModifierOffset: -1`. ESPHome writes ` public:` indented one space; LLVM's default
  of -2 put it at column 0 and would move it in every component we ever touch.
- `InsertBraces: true`. Breaking `if (!final_chunk) return;` onto two lines without braces
  is half a fix. A guard that reads as a no-op is the shape that produced the M5Paper
  watchdog defect.
