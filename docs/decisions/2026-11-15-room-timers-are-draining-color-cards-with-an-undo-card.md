# Room timers are draining color cards with an Undo card

Status: Accepted
Date: 2026-11-15
Type: Display behavior
Supersedes: —
Superseded by: —

## Decision

Each room timer is a card read from across a room. The card's color drains from the top as the time runs down, measured against the timer's total `duration`; a timer with no known duration stays full. The card shows the timer's name, the room it was set for, a countdown as large as the card allows, and its end time. Its controls are round buttons sized from the card, never smaller than 48 px: Pause or Resume, +5, and Cancel, each shown only when the source lists that action. An end-time timer's source omits Pause, so its card has none.

Each timer on screen has its own color from a set of four, and a paused timer is amber. A timer's color comes from its ID, and a clash moves the later ID to the next free color, so the colors stay put while the same timers remain. Ranking order is not used, so adding five minutes never swaps two colors.

A cancelled timer keeps its card, ranked by its deadline as before, as a large Undo button with a draining bar, until the source's `cancels_at`. The source owns the undo window: CastKit draws `state: "canceling"` and sends `undo_cancel`. The card stays in place, so a second tap lands on Undo and not on the next timer.

A card too short for everything drops the end time first, then the room name. The countdown, the paused status and the buttons stay. Fast panels still count in ten-second steps, now without the "~" mark: the exact end time sits under the countdown.

## Context

The first priority timer cards were plain bordered boxes with small text buttons, which were hard to read and hard to press on a 4-inch panel. This record changes how a card looks and adds the Undo card. The ranking, layout policy and freshness rules of [Room timers use deadline priority](2026-11-01-room-timers-use-deadline-priority.md) stand.

## Why

The owner chose this style from three served mockups. The owner wanted larger text and larger controls that read from across a room, different colors for two timers, and an Undo that covers the cancelled timer for 15 to 30 seconds with a countdown.

## Evidence

Owner, November 15, 2026, after reviewing mockups at 480 x 480:

> This screen sucks. Controls are so small. Make it more stylized

> That leads me to C. It's almost the best of both worlds. I like how you show the end time and the location for the announcement! The colors should be super easy to see from afar. I think, if you have 2 timers, it'd be best if their colors were different to make them easier to tell apart.

> I like one-click cancel, but it's too dangerous. If we did that, we'd need an "undo" that replaces over the timer for 15-30s. You could even show a countdown for when the "Undo" will disappear. It also ensures you don't click to cancel and then accidentally cancel another right after.

Browser evidence: `docs/images/room-timer-cards-*.png`, from `e2e/roomTimers.spec.ts`.
