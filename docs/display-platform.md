# Views, channels, and screens

Use [Display targets](display-targets.md) to document the viewing context, purposes
and readable-fit requirements behind a composition. These design records complement
existing layout priorities and screen overrides; they do not add runtime settings.

## Create a browser view

1. Open `/manage`. On a new installation, use the one-time setup token from the private platform file and choose the management PIN. The setup link can carry the token in its `#setup=` fragment; the browser removes it from the address immediately.
2. Add a source connection. Enter its credentials in the source's secret fields.
3. Create a named channel. Select its data contract and source selection. The channel page shows its current status and sample data.
4. Create a view from a specification or composition preset. Choose a single, split, or grid layout. Bind each panel to channels of the required types.
5. Set presentation, theme, control, and access options. Save and open `/view/<id>`.
6. For remote switching, create a screen with a default view and an allowed list. Open `/screen/<id>`.

Use the View menu on a browser screen to choose one of its allowed views. Links to another allowed view stay within that screen, so its address and PIN grant remain valid. Physical displays show navigation only when their view drawer is enabled.

Two browser windows with the same screen URL mirror its selected view. Different screen IDs are independent. The layout follows the browser window size.

## Physical displays

Assign a compatible screen in the device editor. Its installed `/d/<id>` URL stays unchanged. Browser devices receive the composition directly. Image devices receive rendered frames through their existing delivery mechanism. Removing the assignment restores the device's original view system.

CastKit rejects compositions whose renderer, repaint requirement, or value lifetime does not fit a display. Battery power lowers the effective repaint grade. Device output settings still control margins, rotation, dithering, and color correction. A printer view can hide cameras on a touch display while a separate desktop view uses the same printer channel with cameras visible.

The legacy device View command can select an assigned composition when its ID or name matches, or when exactly one allowed single-panel composition has the matching view specification. For unambiguous automation, use the named screen command.

### A temporary view on one display

Any physical display can show a platform view for a while, whether or not it is
assigned a screen. Send the display, not a screen:

```text
<base>/<device-id>/override/set
{"viewId":"kids-points-kitchen","durationSeconds":15,"priority":100}
```

Browser view commands include an optional `navigationId`. When a controller answers
that command with a temporary device override, copy the same ID into the override
JSON. It is a nonempty string of at most 128 characters. The browser uses it to
ignore replies to its superseded local swipes; it does not change priority, expiry
or view caching. Omit it for independent automation selections. Controllers and
clients that omit the field retain their existing behavior.


The equivalent HTTP endpoint is
`POST /api/manage/platform/devices/<device-id>/show`, which answers with the
seconds granted. The highest priority wins and a more recent request wins a tie,
as for a screen. When the last override expires, the display returns to its
assigned screen, or to its own view system: a browser display reloads its
page, and an image display is sent a frame of its own view. Nothing is saved; a
restart ends every temporary view.

The display sets the length. A temporary view is a value whose lifetime is the
time it stays up, so the freshness rule applies to it: it lasts at least ten
repaints. An `instant` or `fast` display keeps the requested time, a `slow`
display lengthens fifteen seconds to thirty, and a `super-slow` display refuses
the request and keeps its view, because it would spend most of a minute in two
full flashes. The view must also be compatible with the display, exactly as for
an assignment. A PIN-protected view on a browser display still needs that
display's grant.

## Screen automation

With MQTT enabled, each screen publishes a Home Assistant select entity. Its command topic is `<base>/screens/<id>/view/set`. Send a view ID as plain text for a persistent selection. For a temporary override, send:

```json
{"viewId":"activity","durationSeconds":120,"priority":100}
```

The highest priority wins. A more recent request wins a tie. When an override expires, the next active override or saved selection returns. A persistent selection clears temporary overrides. Numeric and state histories can also accumulate from selected MQTT channels. Set a channel's history window to retain its changes across restarts, up to 720 hours (30 days). Each entity retains at most 2,000 samples, so frequent changes can shorten the available period. File and total sample limits still apply. Existing Home Assistant history is not fetched automatically by the MQTT adapter.

The equivalent HTTP endpoint is `POST /api/manage/platform/screens/<id>/select`.

View data uses separate topics. The MQTT source defaults to `castkit/channels/<channel-id>/set`, and a channel can select another exact topic. Screen commands do not carry view data.

## Compact chart overviews

For a Home dashboard chart panel, enable **Compact trend charts** to keep a small
line graph below every reading. The compact presentation removes axes and dense
point markers. Missing observations remain gaps, and unavailable readings keep
their status instead of becoming zero. Runtime sensors use readable durations
without attaching a unit to an unavailable value.

Interactive displays can open each sensor's detailed history. Displays without
touch retain the visible trend. Compact charts are optional; existing panels keep
the full chart presentation until the setting is enabled.

## Points

A `points.v1` channel carries the person name, awarded points, message, and optional expiration. A source can supply `total` for an account total or `pointsToday` for a daily total. The view labels each value explicitly. Pair the result with a short screen override to show an NFC outcome without changing the screen URL. The display does not award points.

For a household board, use the **Tally Marks** view on a `kids-points.v1` channel. It shows every child's points today and the last card scan, and a channel can limit scans to one room's readers. See [the Tally Marks view](kids-points-view.md).

## Combined kiosks

Start a saved view from **Combined kiosk**, bind its printer, Rip Deck and AI Usage channels, and keep **Show only what is active** enabled. **Automatic** measures the available room, preserves required content and gives higher-priority components useful space first. Its default order is printers, disc jobs, then AI usage. **A · Adaptive cards** and **B · Cameras and rail** remain manual choices.

In **Panels**, enable **Choose printers for this view**, **Choose bays for this view** or **Choose accounts for this view** and check the items to include. An enabled empty selection shows none. Selections belong to the view, so another kiosk can use a different subset of the same channels.

Enable **Show only usage above zero** to hide idle accounts. **Replace weekly usage with a shorter limit above the alert threshold** shows one quota per account: the aggregate weekly quota normally, or the shorter quota when it is strictly above the threshold (80% by default). At exactly 80%, the weekly quota stays. Usage-window selection can limit the eligible quotas further.

Printer cards can use a compact facts row and bounded SVG controls beside progress. Each card still independently maximizes its camera's contained area before spending spare room on facts. Rip Deck's **Poster cards** presentation fills its region with artwork and shows only whole cards; any remaining active jobs are counted. AI usage stacks accounts in a tall rail and chooses more columns in a shallow region to preserve readable, complete rows.

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

## Intended viewport

A saved view can optionally declare `intendedViewport: { width, height }` in pixels
(whole numbers from 120 through 7680). Set it in the view editor's General tab
when the composition is designed for a specific size, such as a 200 × 200 wrist
display. Leave it off for a flexible composition.

The editor and All views gallery start with **View default**, which uses each
view's saved intended size or fits the available preview area when none is set.
Screen previews use their saved active view's intended size, falling back to the default view. A device profile, browser
window, custom size, fit selection, or resize handle temporarily overrides that
preview without saving a change to the view or device. Save an edited intended
viewport before expecting the saved preview to update.

This is a design and preview preference, not a display restriction. It does not
assign a device, change channel bindings, simulate display capabilities, or alter
the viewport on a real display. Choose a display profile to preview its image
rendering, palette, and other properties.

Saved views represent compositions you intend to open or assign. Reusable rendering
components belong in plugins; a plugin does not need a dedicated saved view merely
to make its component reusable. Keep planned compositions when they have a known
future use, and check screen, device, and automation references before removing a
standalone view. Removing a saved view does not remove its plugin.

## Device view variants

Open **Devices → View variants**, select a shared saved view, and turn on
**Customize this view on this device**. Choose a different compatible channel
for an existing panel input, or enable only the settings this device changes.
A variant can have a display name without creating another saved view or URL.
Save the device to apply changes live; no server restart is required.

The device inherits the shared view's layout, appearance, panel specifications,
access, and control permissions. Settings inherit by field, so changing a
shared setting reaches every device that has not customized that field. Reset
a panel or turn off customization to restore inheritance. An empty optional
input removes its binding; required inputs still need a compatible channel.

Customizations live under `viewOverrides` in the existing device definition:

```json
{
  "viewOverrides": {
    "points": {
      "name": "Tally Marks · Practice",
      "panels": {
        "board": {
          "bindings": { "data": "points/practice" },
          "settings": { "isAllChildrenVisible": true }
        }
      }
    }
  }
}
```

The outer key is the saved view ID, and panel keys are existing panel IDs.
Unknown views, panels, input names, settings, or incompatible channels are
rejected. Shared edits and deletions are checked against saved customizations.
A device customization cannot change access or enable controls on a read-only
shared view.

For reader-specific feedback, bind a channel that filters both scans and timed
activities at the source. Filtering only the last scan after a shared channel
has replaced it cannot recover another room's previous feedback. Browser
snapshots, activity, controls, media URLs, image frames, and previews all resolve effective
device bindings before choosing data. Frame identity includes the resulting
view and data; preview profiles separate different device customizations.
