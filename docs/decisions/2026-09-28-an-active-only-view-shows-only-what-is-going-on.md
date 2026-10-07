# An active-only view shows only what is going on

- **Status:** Accepted
- **Date:** 2026-09-28
- **Type:** product / composition model
- **Supersedes:** —
- **Superseded by:** [A paused track stays in an active-only view for ten minutes](2026-09-29-a-paused-track-stays-in-an-active-only-view-for-ten-minutes.md), for the music clause only.

> ⚠️ **Partly superseded on 2026-09-29.** Music is no longer active only while
> `isPlaying`: a paused track stays active for ten minutes after a real stop.
> See [the newer record](2026-09-29-a-paused-track-stays-in-an-active-only-view-for-ten-minutes.md).
> Everything else below stands.

## Decision

1. **A view can be active-only** (`isActiveOnly` on `ViewDefinition`, "Show
   only what is active" in management). Its panels are laid out as usual, but
   a panel whose bound channel has nothing going on is not drawn, the others
   take the room, and when none is active the view shows one line: `Nothing
   active`. With one panel left the layout is `single`, whatever the view's
   configured layout.
2. **The server answers activity**, from the contract's own data
   (`viewActivity.ts`): a printers channel is active while it lists a printer;
   a rip deck while the tower is present with a job (`activeCount > 0` or a bay
   with a `jobId`); music while `isPlaying`; a queue while it has items. Every
   other contract, and any plugin contract, is always active, so a photo frame
   or a calendar in an active-only view stays on screen. The display snapshot
   carries `panelActivity` for the current view and `isActive` on each of
   `availableViews`.
3. **A tab carries a dot while its view has something active**, so a glance at
   the tab row answers "is anything going on" from any tab.
4. **Two screens, not one.** `Working` holds the tabs for the work in progress:
   `Now` (an active-only partition of the rip deck, the printers and the
   music), `3D Printers`, `Rip Deck`, `Photos`, `Now Playing`. `House` holds the
   household views copied from Home Assistant. The `Rip Deck and 3D Printers`
   split view and the `Desktop monitor` screen are retired, replaced by `Now`
   and `Working`.

## Context

The owner asked whether a screen could hold several views (2026-09-28). Tabs
across the header came first (#115). His second thought was a screen that
*merges* views: *"I want 1 screen to me 'I'm working on stuff' and another
screen to be 'I want to control my house' … I don't wanna display the RipDeck
view on that screen if there's nothing ripping. Same with the 3D prints. If all
plates are cleared, nothing needs to show. It only needs to be active stuff."*
A mockup of three shapes was served (tabs; an active-only partition tab; two
screens built that way), and he picked all three.

## Why

- The activity answer lives on the server because a screen's tabs want it for
  every view on the screen, and the client holds only the current view's
  channels.
- Activity is read from the data, not from channel status: a channel that is
  stale keeps its last data, and a rip in progress should not vanish because
  the tower missed one poll. A channel with no data yet is not active.
- Contracts with no idle state are always active on purpose. The safe reading
  of "I put a photo frame in an active-only view" is that it stays; a view
  that silently dropped it would look broken.
- `Nothing active` is a line, not an empty panel, so the screen is never blank
  and the owner can tell the view is working.

## Evidence

Owner, this chat, 2026-09-28: the request quoted above, then *"1, 2, and 3"*
in answer to the mockup. Stories `WorkingNowBothActive`,
`WorkingNowPrinterOnly`, `WorkingNowNothingActive`; vrt shots
`screen-tabs-1280x480` (dots) and `screen-nothing-active-1280x480`; tests in
`viewActivity.test.ts`, `platform.test.ts` and `Platform.test.tsx`.
