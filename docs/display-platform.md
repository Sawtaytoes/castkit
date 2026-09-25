# Views, channels, and screens

## Create a browser view

1. Open `/manage`. On a new installation, use the one-time setup token from the private platform file and choose the management PIN. The setup link can carry the token in its `#setup=` fragment; the browser removes it from the address immediately.
2. Add a source connection. Enter its credentials in the source's secret fields.
3. Create a named channel. Select its data contract and source selection. The channel page shows its current status and sample data.
4. Create a view from a specification or composition preset. Choose a single, split, or grid layout. Bind each panel to channels of the required types.
5. Set presentation, theme, control, and access options. Save and open `/view/<id>`.
6. For remote switching, create a screen with a default view and an allowed list. Open `/screen/<id>`.

Two browser windows with the same screen URL mirror its selected view. Different screen IDs are independent. The layout follows the browser window size.

## Physical displays

Assign a compatible screen in the device editor. Its installed `/d/<id>` URL stays unchanged. Browser devices receive the composition directly. Image devices receive rendered frames through their existing delivery mechanism. Removing the assignment restores the device's original view system.

CastKit rejects compositions whose renderer, repaint requirement, or value lifetime does not fit a display. Battery power lowers the effective repaint grade. Device output settings still control margins, rotation, dithering, and color correction. A printer view can hide cameras on a touch display while a separate desktop view uses the same printer channel with cameras visible.

The legacy device View command can select an assigned composition when its ID or name matches, or when exactly one allowed single-panel composition has the matching view specification. For unambiguous automation, use the named screen command.

## Screen automation

With MQTT enabled, each screen publishes a Home Assistant select entity. Its command topic is `<base>/screens/<id>/view/set`. Send a view ID as plain text for a persistent selection. For a temporary override, send:

```json
{"viewId":"activity","durationSeconds":120,"priority":100}
```

The highest priority wins. A more recent request wins a tie. When an override expires, the next active override or saved selection returns. A persistent selection clears temporary overrides. Numeric and state histories can also accumulate from selected MQTT channels. Set a channel's history window to retain its changes across restarts. Existing Home Assistant history is not fetched automatically by the MQTT adapter.

The equivalent HTTP endpoint is `POST /api/manage/platform/screens/<id>/select`.

View data uses separate topics. The MQTT source defaults to `castkit/channels/<channel-id>/set`, and a channel can select another exact topic. Screen commands do not carry view data.

## Points feedback

A `points.v1` channel carries the person name, awarded points, message, and optional expiration. A source can supply `total` for an account total or `pointsToday` for a daily total. The view labels each value explicitly. Pair the result with a short screen override to show an NFC outcome without changing the screen URL. The display does not award points.

## Access

Management requires its PIN session or the configured machine API token. First setup requires a private one-time token, so the first anonymous visitor cannot claim the installation. The platform file stores salted PIN hashes and hashed session identifiers. Keep this file private and persistent.

A view or screen can be public or PIN protected. A kiosk uses its on-screen keypad to unlock. The server checks the same session for page data, WebSocket updates, media, and actions. A screen grant covers its configured views; it does not unlock their standalone URLs. Public screens cannot contain private views. PIN changes revoke existing target grants. Optional session minutes cause automatic locking; zero or no value leaves a kiosk grant without a server expiry. Browsers may expire their remembered cookie independently.

Controls are a separate view option. A read-only view cannot issue actions. CastKit rechecks channel membership, current state, and configured action conditions. An integration must validate its own action payloads too.

Authelia identities and per-person policies are a later extension. A shared PIN identifies an authorized browser, not an individual.

## Files and migration

`CASTKIT_PLATFORM_FILE` selects the private configuration file. By default, CastKit stores it beside `INKCAST_DEVICES_FILE` as `<devices-file>.platform.json`; without a device file, it uses `./data/platform.json`. Mount the containing directory persistently. The file contains connections, source credentials, channels, views, screens, device assignments, PIN hashes, and sessions. Writes use an atomic rename.

Existing devices and their retained settings remain available. Their view paths do not require conversion to use the new browser features. Keep an old dashboard available until its replacement has passed a control and data audit.

The root page links to the view library, management, and the API reference. The API reference is `/api`; `/docs` redirects there. Machine endpoints continue under `/api/...`.

Map panels use OpenStreetMap tiles only for their current viewport. CastKit applies the target's access policy to the proxy, preserves attribution, and caches tiles for at least seven days. See the [OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/).
