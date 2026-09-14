# A display is a panel model plus an installation, and every property states what it changes

- **Status:** Accepted
- **Date:** 2026-09-13
- **Type:** Architecture / Device model
- **Supersedes:** [2026-09-13-a-display-is-a-set-of-properties-and-panel-technology-is-not-one-of-them.md](2026-09-13-a-display-is-a-set-of-properties-and-panel-technology-is-not-one-of-them.md), which put orientation, crop and mask in the same list as the hardware facts, graded `repaint` in three steps, and named a property after the answer rather than the fact
- **Superseded by:** —

## Decision

**A registered display is a PANEL MODEL plus an INSTALLATION.** Two axes, and
they are not the same kind of thing.

### Axis A — panel facts. The hardware decides these.

| Property | Values |
| --- | --- |
| `nativeSize` | the glass's own pixel pair |
| `pixelGrid` | `rgb-stripe` \| `bgr-stripe` \| `none` |
| `colour` | `mono` \| `grayscale` \| `e6` \| `e7` \| `full` |
| `dithersItself` | `true` \| `false` |
| `repaint` | `instant` \| `fast` \| `slow` \| `super-slow` |
| `input` | `none` \| `touch` \| `pointer` |
| `shape` | `rect` \| `square` \| `round` |
| `delivery` | `live-browser` \| `pushed-frames` \| `pulled-frames` |

### Axis B — the installation. The owner decides these, per display.

| Setting | What it is |
| --- | --- |
| `orientation` | how this unit is mounted. It fixes the layout box, and it is per unit, not per model. |
| `margins` | push content in from the edge. |
| `crop` | cut content away at the edge. |
| `mask` | which pixels are visible. Seeded from `shape`, adjustable per unit. |

**Two M5Papers are one panel model and two installations.** One can hang
portrait in a hallway and one landscape on a desk. Nothing about the glass
changed. This is why orientation, crop and mask left axis A: a panel fact is
true of every unit of that model, and these are not.

### Every property states what it changes

**A property that does not say what it changes is a label, not a model.** Each
value in both axes carries a written consequence for rendering, and the reference
is [docs/display-properties.md](../display-properties.md). Adding a property
value without its consequence row is an incomplete change.

### The freshness rule

**A view may show a value only if the value will still be true when the panel
finishes drawing it.** Written as a test: show a value when its **lifetime** is
at least **ten times** the panel's repaint time.

| Value | Lifetime |
| --- | --- |
| a seek position, a second hand | 1 s |
| the minute on a clock | 60 s |
| the current song | ~3 min |
| the weather | ~30 min |
| the day's agenda | hours |

That one test reproduces every case the owner named:

| Panel | Repaint | Value | Ratio | Verdict |
| --- | --- | --- | --- | --- |
| Inky pHAT | 3 s | clock minute | 20x | show it |
| Inky pHAT | 3 s | current song | 60x | show it |
| Inky pHAT | 3 s | time remaining | 0.3x | refuse |
| Impression E6 | 28 s | clock minute | 2x | refuse |
| Impression E6 | 28 s | the agenda | 128x | show it |
| HyperPixel | instant | seek position | very large | show it |

**An absolute value beats a relative one on every slow panel.** "Next song at
9:42" has the lifetime of the current track. "3:21 remaining" is already wrong
when the panel finishes drawing it. Where a view can state the same fact either
way, a `slow` or `super-slow` panel gets the absolute form.

### Dithering is a question about three things, not one

CastKit dithers when **all three** are true:

1. The content carries colour or continuous tone. Pure black-and-white content
   needs no dithering on any panel, ever.
2. The panel cannot show that content directly — `colour` is not `full`.
3. `dithersItself` is `false`. When the panel's own controller dithers, CastKit
   sends the full-colour downscale and keeps its hands off.

`dithersItself` replaces the previous `ditheredBy: castkit | panel | none`. The
old name asked "who did it", which mixed a hardware fact with our answer to it;
the panel either has a dithering controller or it does not, and what CastKit
then does is derived.

## Context

The previous record named nine properties and stopped there. The owner's
correction was in two parts, and both are structural.

> Orientation is something not in the list because the screen can be oriented
> however by the user. Same with cropping and masking. Those are user-specified
> that still alter the final render, but in different ways.

> It's possible some M5Paper displays will be vertical and some horizontal. It
> depends on where I'm placing it and how I'm using it. Right now, I have one,
> but I might have two or more.

And:

> We should also document (and show me too) what each label means. What does it
> mean if you've got a super slow update screen? You have fewer views available
> and the ones you have might be missing the time. The Inky pHAT is slow at
> 2-3s, but that's fast enough to show the time and current song, but it can't
> display the "time remaining" for instance. If I wanted, it could display the
> time value the next song starts though. We have options. This is what I mean
> by document the feature of the display and how that affects rendering.

`repaint` gained a fourth grade for the same reason. Three grades put a 3-second
panel and a 28-second panel in one bucket, and the difference between them is
the entire clock.

## Why

Splitting the axes fixes a bug the single list would have produced. A panel
model is a purchasing fact and can be shared by many units; an installation
belongs to one unit on one wall. With one list, registering a second M5Paper
portrait would have meant either two "models" for one piece of hardware, or an
orientation that silently belonged to whichever unit was registered first.

Ten times is a round number, chosen because it separates every case the fleet
actually holds with a wide margin — the closest call is the Impression's clock
minute at 2x, which is a clear refusal, and the pHAT's at 20x, which is a clear
pass. It is a default, not a law: a view may state a stricter requirement.

The freshness rule is worth more than a list of allowed views because it answers
questions nobody has asked yet. "May the agenda show a countdown to the next
event?" has an answer without a meeting.

`dithersItself` is the smaller change and the same idea. A boolean about the
hardware can be read off a datasheet. "Who dithers" cannot, because it depends
on what we decided to send.

## Evidence

The Impression's 28-second full refresh is measured, and it already forced one
view into existence: `Agenda` exists precisely because `Clock (Agenda)` must be
re-pushed every minute
([2026-07-27](2026-07-27-clockless-agenda-view.md)).

⚠️ **The consequence is not enforced anywhere today.** `packages/server` offers
**all nine view names to every image-mode device** — there is no per-device
filter on that half at all, only the browser half filters on touch. So the
Impression is offered `Clock`, `Clock (Weather)` and `Clock (Agenda)`, and
`startClockTicker` re-pushes any device sitting on one of them at the top of
every minute. Read on 2026-09-13 in `views/registry.ts` and
`schedulers/clockTicker.ts`.

The ePaper `Now Playing` views already follow the freshness rule without ever
having stated it: neither `NowPlayingDashboard` nor `NowPlayingPoster` renders a
position or a duration, while the live Slatecast view renders a seek bar with a
running position. Two halves, one unwritten rule, no way to check it.

Chat: T3 Code thread `a7e03562-acab-4308-ba0d-fc93531ece7f`.
