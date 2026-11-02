# Recipes from Mealie

Recipes are a reading view with explicit pages. They do not scroll, auto-advance, or require touch on a physical panel. Ingredients, each instruction, and notes are split into complete pages at a readable size. Mealie quantities and text are preserved; missing ingredients or directions are labeled rather than generated.

## Try the view without assigning a display

1. Add a **Mealie** source in **Manage → Sources**, using its service URL and a user API token. Tokens remain in server-side source secrets.
2. Open **Manage → Recipes**. Leave **Phone only, no display assignment** selected.
3. Choose a saved recipe or paste a recipe link. External recipe links are imported through Mealie; arbitrary webpages are never displayed.
4. Select **Show recipe**. Use **Ingredients**, **Instructions**, **Previous**, **Next**, and **Done cooking**.
5. Expand the 800 × 480 display preview to inspect the static page. **Open phone controls** gives a separate, session-scoped reading page. **Copy cooking link** copies that link for another browser.

The phone-only option does not change a physical display. Placement and hardware can be chosen later. Physical targets in this first version use image delivery and must have at least 320 × 240 usable pixels. Browser kiosks are excluded until they have session-scoped device authorization; phones use the separate cooking controller. A session snapshots the recipe and page dimensions so the phone and panel follow the same page sequence; source edits affect the next session.

Cooking links are bearer capabilities for one active session. Share them only with someone allowed to read and control that recipe. The key travels in the URL fragment, is removed from the address after loading, and is retained only in that tab's session storage. Ending a session revokes it. Source editing and recipe browsing remain behind management authentication.

## Display behavior

A cooking session persists across CastKit restarts until **Done cooking**. It does not replace the saved display selection. Existing explicit view overrides may temporarily cover it; afterward the exact recipe page returns. Finishing restores the current normal display policy. Selecting the same recipe again on the same target retains progress; a different recipe requires ending that target's existing session first.

A page change creates a new selected target revision. This uses the existing image scheduler's selection-change path rather than its much slower background-data refresh interval. Rendering remains serialized and a rapid sequence coalesces to the latest requested page. The phone reports the selected page, not proof that an offline or slowly repainting panel has already drawn it.

Unpowered ePaper retains its image, but it cannot receive another page or a Done update until powered again. Battery operation must be verified for the actual installation. This feature does not provision portable power, repair hardware, or commission a physical placement.

## API and optional automation

Management endpoints:

- `GET /api/manage/cooking/sources/:id/recipes`: list up to 100 saved recipes.
- `POST /api/manage/cooking`: `{sourceId, deviceId, link}`. `link` is a saved slug, a Mealie recipe URL, or an external recipe URL. `deviceId` can be `phone-only/<UUID>` for an unassigned session.
- `GET /api/manage/cooking`: active sessions and their scoped control links.

Session endpoints:

- `GET /api/cooking/:id/state`
- `POST /api/cooking/:id/command`: `{action, revision}`; action is `next`, `previous`, `ingredients`, `instructions`, or `done`.

Session calls accept the existing management authentication or an `x-castkit-cooking-key` header with that session's key. They reject stale revisions and cross-origin mutations. Synthetic recipe views use existing protected viewer access; the scoped link does not grant management access.

Optional MQTT uses `<prefix>/cooking/cmd`, `<prefix>/cooking/resp/<requestId>`, and retained `<prefix>/cooking/state`. A command carries `requestId` (letters, digits, underscores, or hyphens), `issuedAt` (Unix milliseconds), and `action`. Start also carries `sourceId`, `deviceId`, and `link`; other commands carry `sessionId` and the current `revision`. Commands and responses must not be retained. Commands expire after 60 seconds; page revisions prevent repeated Next commands from advancing again after replay. State excludes control keys and source credentials. Successful responses include the scoped control URL for a caller that needs a phone handoff. Protect command and response topics through the broker's access controls.

Voice, phone share-sheet ingress, and actionable notifications are optional integrations. CastKit exposes the session controls, but this feature does not install Home Assistant automations or choose a household recipient or display. A caller should correlate actions to the session ID and latest revision and use its existing notification routing policy.
