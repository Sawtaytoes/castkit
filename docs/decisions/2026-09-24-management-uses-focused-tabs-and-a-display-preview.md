# Management uses focused tabs and a display preview

Status: Accepted
Date: 2026-09-24
Type: UI / preference
Supersedes: None
Superseded by: None

## Decision

Keep the device list beside the editor. Organize the editor into focused, addressable
category tabs, rather than showing every category at once. The selected tab can arrange
its related setting groups side by side when space permits. Wider screens do not reveal
unrelated categories automatically. Size controls for their values rather than stretching
short numeric inputs across the editor.

Keep a display preview beside the active category. Image delivery uses the rendered image;
a browser display uses its web view at the registered layout size, scaled to fit the preview.
The preview reflects saved settings. It is not proof of the physical screen's state.

The browser preview is an observer: it receives snapshots and deltas without contributing
to the device's connection count, and its socket cannot publish commands. The embedded view
is inert. Opening management must not make an offline physical device appear connected.

## Context

Two standalone options were reviewed: A exposed all settings in compact cards; B used tabs
with a display reference beside the form. The owner preferred B's organization and focus,
but wanted to use extra width effectively. The implementation uses Charcuterie's existing
Tabs, AdaptiveGrid, Card, Rail, Field, and Picker components. No second UI library or
app-specific replacement for those shared shapes is introduced.

## Why

The active task stays visible. Extra width can remove scrolling within a category without
turning management back into a wall of unrelated controls. Image output and a scaled browser
view make the preview useful without confusing it with a hardware screenshot.

## Evidence

Owner, T3 Code conversation in workspace worktree `t3code-cb120e98`, 2026-09-24
(chat UUID unavailable):

> "I like A a lot, but I think B is a lot better overall. Super organized on B!"

> "You can even have it show the image output _or_ an iframe of the web view if it's an active device with a browser rather than an image streamer."

> "A is too unorganized. That's why I don't like it. It makes it hard to focus on the one thing you need to edit."

The tabbed base and preview are accepted. The built review remains separate from production
until the owner confirms its presentation, following the workspace UI preview workflow.

## Related

- [Device management uses a list and editor](2026-08-27-device-management-uses-a-list-and-editor.md)
