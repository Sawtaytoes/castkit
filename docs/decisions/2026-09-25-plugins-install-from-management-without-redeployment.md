# Plugins install from management without redeployment

- **Status:** Accepted
- **Date:** 2026-09-25
- **Type:** Architecture / Product
- **Supersedes:** the build-only installation mechanism in [Named channels and extensions drive reusable views](2026-09-25-named-channels-and-extensions-drive-reusable-views.md). The other boundaries remain in force.
- **Superseded by:** —

## Decision

Management installs compatible, prebuilt CastKit plugin packages from npm or an uploaded archive. Installation, compatible upgrades, and removal update the running registry without rebuilding or redeploying CastKit. Packages persist beside the platform configuration. Existing build-installed packages remain supported.

Package inspection precedes execution. The administrator reviews the resolved version and capabilities, then installs the trusted package. Integrity, archive bounds, declared public assets, SDK compatibility, identifier collisions, and existing configuration are checked before activation. Package lifecycle scripts and dependency installation are unnecessary: authors publish bundled server and browser modules. Server code has the application's privileges; this is a trusted extension system, not a sandbox.

Management lists show names and a small access icon. PIN editing belongs in the selected item's editor. The plugin page does not repeat a component catalog with identical names and renderer labels. The integration-independent points display library is named Points.

## Context

The first release could enable bundled libraries but could not add a package from management. Its collection labels overflowed their list column, and an intrinsically sized login wrapper collapsed at some viewport sizes. Presence-only browser checks missed those geometry defects.

## Why

A plugin installation should not require deployment access. Durable package storage and a live registry make the UI installation action effective immediately. Geometry assertions complement interaction checks for responsive management layouts.

## Evidence

Owner, thread `a377d73f-caf1-4fa9-9e86-5d1399fe6a56`: “Also, all of these say ‘Set PIN’. We don't need that there.” “You can show a lock icon if you want somewhere.” “For ‘Add a Plugin’, is that something we can do dynamically, like download the node_module and unpack it in software or something? It should be something that doesn't require a redeploy.”
