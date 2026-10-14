# The desktop app finds CastKit servers by scanning, and groups pages by screen

Status: Accepted
Date: 2026-10-13
Type: Platform
Supersedes: None
Superseded by: None

## Decision

1. **A CastKit server identifies itself.** `GET /api/identity` answers `{ "product": "castkit", "publicUrl": … }`, with `publicUrl` from `CASTKIT_PUBLIC_URL` or `null`. It is public and carries nothing else.
2. **The settings window scans for servers, and typing an address is the last resort.** It scans when it opens without a server and on **Scan again**: `castkit.local` and `castkit` first, then every host of each local IPv4 /24 on ports 8788 (CastKit's default) and 8789 (the next port up, where an install whose host already uses 8788 usually publishes it). A TCP connect probe comes first, so a closed port costs no HTTP request, and only an open port is asked for its identity. A found server is offered at its public address when that address also answers from this computer, otherwise at the address the scan found. **Enter an address** stays available under the results.
3. **The page list groups views under the screens that show them.** `GET /api/views` now carries each screen's `viewIds`. The list shows the screens first, each with the number and the first names of its views, then a group per screen ("On the House screen"), then "Not on a screen". A view on two screens is listed under both. Every row shows its path, so two views with one name are told apart, and a PIN badge. A search box filters by name, id, path, and screen, every word in any order. Opening a page by its address (`/d/<id>`) moves under the list.
4. **The settings window is React with `@charcuterie/ui`**, built by Vite into `dist/settings/`, like CastKit's admin app. It fills the window: when the window is at least 880 x 560 the page list and the window list scroll inside their panels and the page has no scrollbar, and a smaller window is one column that scrolls as a whole.
5. **Holding the pointer over a display frames that monitor**, with the identify overlay, the way Image-Viewer's display menu does.

## Context

The first settings window was plain HTML: a text box for the server address, a text box for a page path that read like a search but was not one, and every screen and view as a wrapped button labeled only "Screen: …" or "View: …". Duplicate names (two "Now Playing", "Rip-Deck" and "Rip Deck") could not be told apart.

mDNS was considered and not used: the reference install runs in Docker bridge networking, where a multicast announcement from the container never reaches the LAN, so an mDNS-only discovery would find nothing in the install it was written for.

## Why

- A person knows which screen a view belongs to; a flat list of names does not say it.
- Typing an address is error-prone, and the server can say where it lives.
- A sweep of two ports on one /24 is about 500 connection attempts, a few seconds, and only the open ports see an HTTP request.

## Evidence

Maintainer, T3 Code thread `bfbdc019-bd43-45f4-9e7e-df2c7214a3e5`, 2026-10-13:

> Can you make this display using the whole window without a scrollbar but optionally add it if the display's too short to fill it 100%? Also, can we use Charcuterie controls here too just to make it feel more normal? Lastly, isn't there a way to show all CastKit servers on the network somehow? If so, we could just scan for it and find it that way. Typing in the URL manually should be a last-case mechanism.

> "Pages on this server" […] this doesn't fit at all. It's hard to view. I have no clue what's what. All say "Screen" or "View", man... Not well organized. […] This input at the top isn't a filter either. I dunno what I'm supposed to type in there.

> Like Image-Viewer, hovering these displays should highlight that display.

- Server: `packages/server/src/app.ts` (`/api/identity`), `packages/server/src/platform/platformRoutes.ts` (`viewIds`).
- Desktop: `packages/desktop/src/serverDiscovery.ts`, `src/settings/pageGroups.ts`, `src/settings/*.tsx`, `vite.settings.config.ts`, each pure module with a colocated test.

## Library proposal

Charcuterie has no inline, grouped, searchable list of rows with an action per row (`Listbox` is a popup). The rows here are app-local, like the admin app's device list, and are a candidate for a Charcuterie component.
