# CastKit plugins

CastKit separates source adapters, versioned channel data, view specifications, and saved compositions. The SDK has no UI framework or Charcuterie dependency.

## Install from management

1. Open **Manage → Plugins → Add plugin**.
2. Enter an npm package name and an optional exact version, or upload a compatible `.tgz` package.
3. Select **Review package**. CastKit shows the resolved version and the views and sources it provides.
4. Select **Install plugin**. The running catalog updates immediately. No build, application restart, or redeployment is required.
5. Configure its sources and channels, then add its components to a view.

Installing a newer version of the same package follows the same flow. The previous installation remains active if inspection, import, or configuration validation fails. An update must preserve the inputs and channel types used by saved configuration. Existing source instances restart when their factory changes; unchanged sources continue running. A downloaded package can be removed after its sources, channels, and views no longer use it.

Plugins execute trusted application code on the server and in the CastKit origin. Inspection reads metadata without importing the module. Installation verifies integrity and compatibility before activating its factories. Package lifecycle scripts never run. CastKit does not install transitive dependencies: compatible packages contain prebuilt server and browser modules. Package files and their active index live under `<platform-file>.plugins`, on the same persistent volume as the configuration.

Npm downloads use the public npm registry and a resolved exact version. Uploads support private and unpublished packages. Both paths use the same bounded archive validation. CastKit rejects path traversal, links, oversized archives, unsupported SDK versions, identifier collisions, and exports outside the declared browser directory. Only public browser assets are served over HTTP. Server modules and package metadata are not served as assets.

### Prepare a runtime package

A package includes this metadata:

```json
{
  "type": "module",
  "castkit": {
    "apiVersion": 1,
    "manifest": "castkit.manifest.json",
    "server": "dist/server.js",
    "publicDirectory": "dist/browser"
  }
}
```

`castkit.manifest.json` contains a serialized `PluginManifest`. Its `browserEntry` values are package-relative paths such as `dist/browser/view.js`. The server module exports `default` or `castkitPlugin`; its manifest must match the reviewed JSON. Bundle all non-built-in dependencies into these modules. Do not run timers or network work at module scope; start them in an adapter factory and release them in `dispose`.

The installer rewrites browser entries to immutable, installation-specific `/api/plugins/assets/...` URLs. Open displays receive the new specification and replace the old renderer without reloading the page. A failed renderer download shows a retry action. Failed packages on startup report an error in management while built-in capabilities remain available.

The [example clock package](../examples/clock-plugin/README.md) includes a build script and packing instructions. It works without a UI framework. The SDK itself remains framework independent.

### Build-installed packages

The existing deployment path remains supported: install an exact version with Yarn, list its package name in `castkit.plugins.json`, and run `yarn build`. Those packages are part of the application image and cannot be removed through management. Their `browserEntry` is a package export such as `@example/castkit-extension/browser`; the build bundles it into `/assets/plugins/...js`.

## Package contract

Export `default` or `castkitPlugin`, typed as `CastKitPlugin` from `@castkit/sdk/plugin`. Declare `apiVersion: 1`, a unique plugin ID, semantic package version, adapters, and view specifications. Optional `presets` describe reusable compositions.

A source factory receives its configured source, selected channels, credentials, cancellation signal, fetch function, optional MQTT transport, and publish/error callbacks. It publishes normalized values into a channel. It owns no browser connection. Its `dispose` function releases timers and subscriptions. Network work must honor the supplied cancellation signal.

Each channel declares a versioned contract such as `printers.v1` or `images.v1`. Register a parser for a custom contract through the package's `contracts` map. The channel cache validates every value before a renderer can receive it. Invalid updates retain the last valid value and expose an error status. Consumers must distinguish waiting, ready, stale, and error states.

A view specification declares named inputs, their contract types, settings, supported delivery modes, and its minimum repaint or value lifetime. Its browser entry follows the runtime or build-installed format above. A browser renderer exports `mount(element, host)` and returns `update(host)` and `destroy()`.

The host provides:

- `getChannel(input)` and `subscribe(listener)` for bound, normalized channel data.
- `executeAction({input, action, payload})` for an authenticated, scoped action.
- `mediaUrl({input, assetId, kind})` for source media through CastKit.
- Presentation settings, theme values, and whether controls are available.

An adapter must validate action names, entity or asset membership, and payload values. The host also checks the current view, selected input, control permission, data availability, and configured conditions. Credentials never enter the view definition or renderer host.

The example is not enabled by default. It can be uploaded from management after packing, or included through the existing deployment manifest.

## Rendering and themes

A view can use its own framework and styling. Use the SDK's optional theme values to integrate with the host, or supply your own theme. Saved views can set fonts and colors without changing their channels.

Server-generated frames use the same browser composition and channel data, followed by the existing panel margins, color conversion, rotation, and dithering pipeline. The Chromium render engine is required for this path. A view must explicitly declare `image` support. Live cameras remain browser-only. Repaint and battery properties constrain which compositions a physical display can use.

The bundled adapters and view groups have separate plugin entries. You can disable an unused group without removing unrelated sources or views. CastKit prevents disabling a plugin while a saved source or view uses it. Presets disappear when any required component is disabled. The shared data contracts remain available.

## Sources supplied by CastKit

- MQTT: named topics, retained snapshots, explicitly allowed command actions, and media from configured origins.
- Home Assistant: an optional direct API connection for selected entities, groups, calendars, weather, images, cameras, history, and narrow service actions.
- Immich: photo selections from people, albums, or search. Credentials stay on the server.
- Rip Deck: normalized bays, job state, poster art, and supported drive controls.
- Bambuddy: selected printers, progress, covers, camera snapshots, and printer controls.
- Clock: local time without a network service.

An API source writes directly to the internal channel cache. It does not need to publish its results back to MQTT. A Home Assistant publisher can instead supply the same contracts through named MQTT channels.

## Package format references

The package uses the standard npm archive and [`package.json` file inclusion rules](https://docs.npmjs.com/files/package.json/). Immutable module paths account for [Node's ESM module cache](https://nodejs.org/api/esm.html#urls); changed versions use different paths rather than overwriting a loaded module.
