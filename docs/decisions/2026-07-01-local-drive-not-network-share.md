# Develop on a local drive with the node-modules linker, not the G: network share

- **Status:** Accepted
- **Date:** 2026-07-01
- **Type:** constraint
- **Supersedes:** —
- **Superseded by:** —

## Decision

The Inkcast working tree lives on a **local drive** —
`D:\Code-Projects\Personal\inkcast`, alongside the other app repos
(`mux-magic`, `gallery-downloader`, `image-viewer`) — and uses Yarn's standard
**`nodeLinker: node-modules`**. It is NOT developed on the `G:\Projects\Code`
mapped SMB share, despite that being the general homelab convention for "where
code lives".

## Context

The initial scaffold was created at `G:\Projects\Code\inkcast`. `G:` is a mapped
SMB drive (`\\storeman.octen` → `/mnt/Bunnies/Family`). Two independent,
fundamental failures made it unusable for a Node/Yarn workspace:

1. **`nodeLinker: node-modules`** → `EPERM: operation not permitted, symlink`
   when Yarn tries to link workspace packages into `node_modules`. Mapped network
   drives don't support the directory symlinks a workspace monorepo requires.
2. **`nodeLinker: pnp`** (tried as a symlink-free alternative) → `EBADF: bad file
   descriptor, fstat` from the experimental PnP ESM loader reading files over
   SMB. The PnP runtime can't reliably fstat over the network drive.

This is the same class of mapped-drive tooling breakage the homelab already
tracks (the `claude-code-mapped-drive-fix` repo). It is almost certainly why the
sibling app repos were themselves moved off the share to `D:\Code-Projects`.

## Why

- Kevin: "If it doesn't work there, we'll move it to my local drive instead."
- The base app repos already live on `D:\Code-Projects\Personal` (local) and
  install fine there with the node-modules linker.

Local disk supports symlinks and fast fstat, so the standard, proven mux-magic
toolchain (node-modules linker, tsx, vitest, Playwright, native sharp/resvg)
works without PnP workarounds.

## Evidence

- Install log on `G:`: `Error: While persisting … EPERM: operation not
  permitted, symlink 'G:\…\packages\core' -> 'G:\…\node_modules\@inkcast\core'`.
- PnP run on `G:`: `Error: EBADF: bad file descriptor, fstat … getSourceSync …
  ModuleLoader.commonjsStrategy`.
- After moving to `D:` + node-modules linker: `yarn install`, `yarn typecheck`
  both green.

## Consequences

- The GitHub remote (see [public-oss-app-on-github](2026-07-01-public-oss-app-on-github.md))
  is the source of truth across machines, not the network share.
- The `G:\Projects\Code` convention still holds for repos that are not Node/Yarn
  workspaces; it specifically does not work for this one.
