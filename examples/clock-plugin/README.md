# Example clock plugin

This example supports both CastKit's deployment manifest and runtime package installation.
The renderer uses plain DOM APIs and the framework-independent CastKit SDK contract.

## Build a runtime package

From the CastKit checkout, with its Yarn dependencies installed:

```sh
node examples/clock-plugin/build.mjs
```

The build creates `castkit.manifest.json`, a bundled ESM server entry at
`dist/server.js`, and the browser entry under `dist/browser`. Package the example
with Yarn's `pack` command from a standalone copy of this package, or publish the
built package to an npm registry. Upload the resulting `.tgz` through **Add plugin**,
or enter the published npm package name and version. Review the package, then install.
No application rebuild or restart is needed.

For a standalone authoring project, declare esbuild as a development dependency and
keep `build.mjs` with the source. Dependencies must be included in the bundles. CastKit
never runs install scripts, resolves dependencies, or compiles TypeScript while installing.
Node built-in imports can remain external in the server bundle. Browser bundles must use
relative imports for any separately bundled files beneath their public directory.

## Runtime package format

The `package.json` `castkit` field declares:

```json
{
  "apiVersion": 1,
  "manifest": "castkit.manifest.json",
  "server": "dist/server.js",
  "publicDirectory": "dist/browser"
}
```

The manifest is ordinary JSON with the same fields as `PluginManifest`. Each
`browserEntry` is a package-relative file within `publicDirectory`. The server module
exports `default` or `castkitPlugin`, with a manifest identical to that JSON and any
adapter factories or custom contract parsers. The package version and manifest version
must match. The package uses `"type": "module"`.

The public directory contains only browser code and assets. The package manifest,
`package.json`, server bundle, and credentials must remain outside it. CastKit verifies
registry integrity before inspection, checks the executable export after approval, and
serves browser assets under an immutable installation ID. Updating a package therefore
loads a new browser entry. Incompatible updates leave the active version in place.

Installed plugins execute trusted JavaScript in CastKit. Review the publisher and package
before installing. The server module is not a sandbox.

## Deployment manifest compatibility

The original `index.js` and `browser.js` exports remain available for
`castkit.plugins.json`. A deployment build can still bundle this example in the existing
way. Runtime installation uses the generated files instead.

## Format references

The registry lookup follows npm's [package version endpoint](https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md#package-endpoints)
and [package metadata format](https://github.com/npm/registry/blob/main/docs/responses/package-metadata.md).
Package file selection follows npm's [package.json files field](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#files).
