# Browser views reserve space for content

Status: Accepted
Date: 2026-10-01
Type: Display interaction
Supersedes: The access chrome portion of [shared management sign-in](2026-09-30-public-printer-views-use-shared-management-sign-in.md)
Superseded by: None

## Decision

Browser views omit the screen or view name and authentication controls. Combined
AI panels also omit the redundant AI Usage heading and return its height to
account rows; standalone AI views keep their heading. Sign in,
sign out and management PIN changes remain in admin, with immediate session
refresh across open displays. Keep a named screen's view tabs and private-view
unlock keypad. Authentication, server-side permissions, disabled control reasons
and printer action confirmations retain their existing behavior.

A disconnected loaded display retains its last data with controls disabled. A
four-pixel yellow viewport border marks reconnecting. A red border marks a
missing view (HTTP 404), an initial load failure, or an outage lasting 30 seconds.
Reconnect continues in either state; a successful subscription clears the border.
A visually hidden live status announces the connection state without taking space.

Compact printer cards retain the same camera-to-facts gap in either orientation.
Their filament summary uses a complete row with a normal-flow details button,
so both the material and count contribute to measured facts height and stay inside
its allocated cell. Camera area, readable facts and bounded controls keep their
existing priority order.

## Context

A browser kiosk header occupied room that a device kiosk gave to content.
Compact cards removed the media gap and allowed an absolutely positioned
filament control to shrink beneath its contents.

## Why

The display is for observing work. Management belongs in admin; connection
feedback must stay visible without shrinking the content. Real content bounds
must inform the priority layout instead of clipping a summary.

## Evidence

Owner, chat `08aa412b-7bd8-47c5-b452-4085fc663efc`, 2026-10-01:
“in a browser, I don't need the "Sign out" button or the "Working" screen's name.”
“Missing padding/margin between the video and the text.”
“Also don't need the "AI Usage" text where that's located.”

Browser regressions cover both compact orientations, filament bounds, missing
view and reconnect recovery. End-to-end coverage signs in and out in admin
while observing enabled and disabled controls across existing view tabs.
