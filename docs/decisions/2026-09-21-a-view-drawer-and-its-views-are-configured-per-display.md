# A view drawer and its views are configured per display

- **Status:** Accepted
- **Date:** 2026-09-21
- **Type:** Interaction / installation configuration
- **Supersedes:** [A touch panel opens its view drawer from either screen edge](2026-09-21-a-touch-panel-opens-its-view-drawer-from-either-screen-edge.md), for making the drawer universal and listing every compatible view
- **Superseded by:** [An edge hands the panel back, and draws nothing](2026-09-23-an-edge-hands-the-panel-back-and-draws-nothing.md), for the workbench panel's navigation only. The `hasViewDrawer` switch and the ordered `views` allow-list both stand.

## Decision

A browser display explicitly opts into its panel-local edge drawer with
`hasViewDrawer`. The default is false. Touch capability permits interaction; it
does not by itself place permanent navigation controls above every application.

An installation may set an ordered `views` allow-list. The same list defines
the Home Assistant View options and the drawer targets, so the automation and
the person at the glass use one vocabulary. The list can mix CastKit views and
that device's named external views. An absent list preserves the earlier
behavior and offers every compatible view, so an existing config does not lose
views during an upgrade.

Both controls belong in CastKit's device editor because they are installation
choices. A configured drawer still opens from either vertical edge and still
remains above an external iframe. Touch Test remains an available native view,
but appears only when the installation includes it or keeps the all-compatible
default.

## Context

The first drawer release treated `hasTouch` as permission to show handles on
every touch panel and listed every compatible view. The owner instead wants the
new printer workbench panel to have a deliberate set of views, without changing
the Rip Deck panel or every future touch installation.

## Why

The drawer is visible application chrome and therefore an installation choice,
not a hardware fact. An allow-list keeps task panels focused while preserving
CastKit's device-independent view names. Default-off avoids changing existing
touch displays merely because the server gains a navigation feature.

## Evidence

> “I didn't wanna always have every screen display these pull bars and a menu of all views. I wanted to configure the views.”

Owner, T3 Code chat `t3code-31fc6ae0`, 2026-09-21.
