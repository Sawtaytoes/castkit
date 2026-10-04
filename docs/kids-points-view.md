# Tally Marks view

Each child's points today against the day's goal, and the result of the card a
child just scanned. A panel that fits complete cards is a board: cards can
use columns, a grid, or a tall stack. A smaller panel gives a scan to the
child who scanned.

![A scan on a 1280 x 720 panel: the child who scanned is outlined and the rest of the board dims](images/2026-09-29-kids-points-scan-1280x720.png)

![The same scan on a 480 x 480 panel: that child alone](images/2026-09-29-kids-points-scan-480x480.png)

![A 480 x 320 panel with no scan: one row per child, and the rows that do not fit are counted](images/2026-09-29-kids-points-rows-480x320.png)

All names and numbers in these pictures are fixture data.

CastKit never awards points. A points service decides every scan; CastKit only
draws what that service already published.

## Where the data comes from

A channel of type `kids-points.v1`. Two adapters fill it.

| Adapter | Use it when |
| --- | --- |
| **Tally Marks** | A points service publishes one retained state document per child and one result message per scan. |
| **MQTT** | Something else already builds the canonical `kids-points.v1` document below and publishes it to one topic. |

The **Tally Marks** adapter subscribes to two topics, both source settings:

| Setting | Default | What it carries |
| --- | --- | --- |
| `stateTopic` | `points/state/+` | One retained document per child; `+` is the child's ID. |
| `scanTopic` | `points/resp/scan` | One message per card scan, not retained. |

A child's state document:

```json
{
  "kid": "robin",
  "kidName": "Robin",
  "kidColor": "#81B29A",
  "pointsToday": 130,
  "goal": 500,
  "lastTask": "Feed the Cat",
  "runningSession": { "taskName": "Reading", "startedMs": 1763990000000 }
}
```

A scan result:

```json
{
  "kid": "robin",
  "kidName": "Robin",
  "outcome": "award",
  "points": 10,
  "pointsToday": 140,
  "goal": 500,
  "taskName": "Feed the Cat",
  "message": "Robin fed the cat.",
  "reader": "Hall Reader",
  "ts": 1763990000000
}
```

`outcome` is reduced to four results: `award` is **awarded**,
`session-start` is **started**, `session-stop` is **stopped**, and every other
outcome (too early, already done, busy) is **refused**. A refusal shows the
service's own `message`, because "Not counted" alone does not tell a child
whether to try again later. The scan's `pointsToday` updates that child's
total at once; the state document that follows confirms it.

Two channel settings narrow what a channel shows:

- `kidIds` — the children on this board. Empty is every child.
- `readers` — the card readers whose scans this channel shows. Empty is every
  reader. A room's display lists the room's own reader, so a scan in another
  room does not take it over. The picker offers each reader after its first
  scan.

A `kids-points.v1` channel never goes stale on its own. The service publishes
only when a child's day changes, and a quiet afternoon is not an outage. Set
`staleAfterSeconds` on the channel to change that.

## The contract

```ts
{
  kids: [
    {
      id: "robin",
      name: "Robin",
      pointsToday: 130,
      goal: 500,                 // optional; no goal draws no bar
      color: "#81B29A",          // optional; the child's identity color
      lastTask: "Feed the Cat",  // optional
      activeTask: {              // optional; a timer running now
        name: "Reading",
        startedAtMs: 1763990000000,
      },
    },
  ],
  lastScan: {                    // optional
    kidId: "robin",
    result: "awarded",           // awarded | refused | started | stopped
    points: 10,
    taskName: "Feed the Cat",    // optional
    message: "Robin fed the cat.", // optional
    reader: "Hall Reader",       // optional
    atMs: 1763990000000,
  },
}
```

## What the view decides

**A board is every child side by side.** The view measures its own box. When
every child fits on a card at least 220 px wide and 200 px tall, it draws a
board, one column per child, in the producer’s manual `displayOrder` (with name order as the fallback) so a card does not move when the
totals change. Otherwise it draws rows, and it draws only the rows that finish
on the glass, with the rest counted underneath.

**A scan holds the panel for `scanSeconds`** (default 15, the same length as
the screen override that shows a scan in a room). On a board the child who
scanned is outlined and carries the result, and the other cards dim but stay.
On a smaller panel the whole panel goes to that child: the name, the result,
the task, and the total against the goal.

**The scan window is the display's temporary-view time.** A scan result is a
value with a short life, so the freshness rule sets how long it stays:
`getTemporaryViewSeconds` in `@castkit/shared/panels/repaint`, the same rule
that sets how long a temporary view stays on a display. An `instant` or `fast`
panel keeps `scanSeconds`. A `slow` panel lengthens it to ten repaints, thirty
seconds. A `super-slow` panel never shows a scan: it shows the board or the
rows, whose totals change only when a card is scanned. A running timer is
stated absolutely — `Reading since 4:05 PM` — so it stays true on every panel.

**Only an instant panel moves.** On an `instant` panel a scan that earned points
plays in the child's card or across the whole small panel:

1. A chip with the points (`+20`) appears above the old total.
2. The chip drops into the total. The old total squashes out, and the new total
   bounces in. The goal bar grows from where it was.
3. The scan that reaches today's goal throws confetti, and **Goal reached**
   pops in.
4. A scan after the goal flips the total with a gold glow inside a ring of
   stars.

On a small panel the total is the hero while this plays, and the scan's line
(`+20` and the task) arrives under it when the number settles. A `fast` or
`slow` panel draws the same result as a still frame: the points the scan earned,
the task, and the new total. A refused scan and a timer start earn nothing, so
they do not move the total on any panel.

Every motion element's resting style is the end of its motion. A panel with
motion switched off — the blanket rule on
`html:not([data-repaint="instant"])`, or `prefers-reduced-motion` — therefore
shows the final total and never a half-played frame. The confetti and the stars
are a fixed pattern (the golden angle), not random, so screenshots stay stable.

![A goal scan on a 480 x 480 instant panel, frame by frame, from fixture data](images/2026-09-29-kids-points-goal-motion-480x480.png)

![A scan after the goal on a 480 x 480 instant panel, from fixture data](images/2026-09-29-kids-points-bonus-motion-480x480.png)

**The identity color is a stripe and a bar, never type.** An identity color is
chosen to match printed cards, and a pale one is unreadable as text on a light
scheme. On a monochrome panel every stripe and bar is the body ink.

## Showing a scan in the room where it happened

CastKit does not know which room a reader is in; the house does. The pattern:

1. Give each room a view whose Tally Marks channel lists that room's reader in
   `readers`.
2. When a scan result arrives, send each display in that room a temporary
   view: `<base>/<device-id>/override/set` with
   `{"viewId":"<view-id>","durationSeconds":15,"priority":100}`. A browser
   screen with no physical display takes the screen override instead:
   `<base>/screens/<screen-id>/view/set` with the same payload.

The display decides the rest. An `instant` or `fast` display keeps fifteen
seconds, a `slow` one takes thirty, and a `super-slow` one refuses and keeps
what it was showing. The automation can therefore send the view to every
display in the room without knowing what each display is. See
[temporary views on a display](display-platform.md#a-temporary-view-on-one-display).

The override brings the view up; the channel's reader filter decides which
child it shows. A board that is always on a large panel needs no override —
leave `readers` empty and every scan in the house marks its child.

## Active-only monitoring

A Kids Points panel in an active-only view appears during the most recent scan's feedback window (`scanSeconds`, default 15 seconds), then disappears. Retained totals and timed tasks alone keep it idle. The server pushes the expiry over the live socket even when the broker sends nothing else. Regular points views continue showing the totals between scans. Slow panels use the existing repaint minimum; super-slow panels do not show temporary feedback.

## Adaptive cards

Complete cards now fill a measured grid selected by Charcuterie’s shared priority policy. Tall portrait boxes stack the children over the full height, retaining last-task details and making earned points larger than the adjacent goal. Wide boxes can use columns. Every card must meet its minimum size; constrained boxes retain complete compact rows and an overflow count.
