# CastKit plugins

CastKit separates source adapters, versioned channel data, view specifications, and saved compositions. The SDK has no UI framework or Charcuterie dependency.

## Install an extension

1. Review the package as trusted application code. A source adapter executes on the server. A renderer executes in the CastKit origin.
2. Install an exact package version with Yarn: `yarn add @example/castkit-extension@1.2.3 --exact`.
3. Add its npm package name to the `packages` array in `castkit.plugins.json`.
4. Run `yarn build`. The build imports the package manifest, bundles each browser entry, and includes the server factories in the application bundle.
5. Restart CastKit with the new build. Open **Manage → Plugins** to inspect the registered adapters, views, and presets.
6. Configure a source, create named channels, and bind a view's inputs to compatible channels.

Installation is a deployment step. The management page configures installed code. It does not download or execute an arbitrary package from an HTTP request. Keep the Yarn lockfile with the deployment. To remove a package, remove or replace its configured views and sources, remove it from the manifest, and rebuild.

## Package contract

Export `default` or `castkitPlugin`, typed as `CastKitPlugin` from `@castkit/sdk/plugin`. Declare `apiVersion: 1`, a unique plugin ID, semantic package version, adapters, and view specifications. Optional `presets` describe reusable compositions.

A source factory receives its configured source, selected channels, credentials, cancellation signal, fetch function, optional MQTT transport, and publish/error callbacks. It publishes normalized values into a channel. It owns no browser connection. Its `dispose` function releases timers and subscriptions. Network work must honor the supplied cancellation signal.

Each channel declares a versioned contract such as `printers.v1` or `images.v1`. Register a parser for a custom contract through the package's `contracts` map. The channel cache validates every value before a renderer can receive it. Invalid updates retain the last valid value and expose an error status. Consumers must distinguish waiting, ready, stale, and error states.

A view specification declares named inputs, their contract types, settings, supported delivery modes, and its minimum repaint or value lifetime. Its `browserEntry` is an exported module of the installed package, for example `@example/castkit-extension/browser`. The build turns that entry into a local `/assets/plugins/...js` asset. A browser renderer exports `mount(element, host)` and returns `update(host)` and `destroy()`.

The host provides:

- `getChannel(input)` and `subscribe(listener)` for bound, normalized channel data.
- `executeAction({input, action, payload})` for an authenticated, scoped action.
- `mediaUrl({input, assetId, kind})` for source media through CastKit.
- Presentation settings, theme values, and whether controls are available.

An adapter must validate action names, entity or asset membership, and payload values. The host also checks the current view, selected input, control permission, data availability, and configured conditions. Credentials never enter the view definition or renderer host.

See [the example plugin](../examples/clock-plugin/) for a renderer with no framework dependency. For local development, install that package with Yarn's `file:` protocol or use a workspace package, list its package name in `castkit.plugins.json`, and build. The example is not enabled by default.

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
