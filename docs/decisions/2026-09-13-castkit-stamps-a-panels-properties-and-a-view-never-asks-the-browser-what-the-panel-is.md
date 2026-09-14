# CastKit stamps a panel's properties, and a view never asks the browser what the panel is

- **Status:** Accepted
- **Date:** 2026-09-13
- **Type:** Architecture / CSS
- **Supersedes:** — it fixes the mechanism for the property model in [2026-09-13-a-display-is-a-set-of-properties-and-panel-technology-is-not-one-of-them.md](2026-09-13-a-display-is-a-set-of-properties-and-panel-technology-is-not-one-of-them.md)
- **Superseded by:** —

## Decision

**Every document CastKit renders carries the panel's properties, stamped on
`:root` by CastKit. A view's CSS keys on those. It never asks the browser what
kind of panel it is on.**

```html
<html
  data-shape="round"
  data-colour="mono"
  data-input="touch"
  data-repaint="slow"
  data-delivery="pulled-frames"
  style="--panel-width: 960px; --panel-height: 540px; --panel-min: 540px"
>
```

`@media` keeps exactly one job: **facts the document itself genuinely knows.**

| Ask the browser (`@media`) | Ask the stamp (`:root[data-…]`) |
| --- | --- |
| `width`, `height`, `aspect-ratio`, `orientation` | `shape`, and the mask a non-rectangular panel needs |
| `prefers-reduced-motion`, `prefers-color-scheme`, `forced-colors` | `colour`, `ditheredBy` |
| — | `repaint`, `input`, `delivery`, `pixelGrid` |

Two consequences:

1. **The short-landscape rule stays a real media query.** A document that is
   480×320 knows it is 480×320, in both halves, in Storybook, and behind a
   devshare. `@media (min-aspect-ratio: 5 / 4) and (max-height: 400px)` is
   correct and stays.
2. **`(update: …)`, `(monochrome)`, `(color)`, `(pointer: …)` and `(hover: …)`
   are banned in CastKit CSS**, even though they describe precisely the
   properties we care about. They answer about the machine holding the
   rendering engine, which is never the panel.

The stamp is written in one place per renderer — the server's page shell for
`live-browser`, the render harness for `pushed-frames` and `pulled-frames` —
from the same device record. Storybook stamps it from the same record too, so a
story cannot disagree with the panel.

## Context

The owner asked for the opposite, and the reasoning is sound on its face:

> We can also use `@media` queries on these devices. They should register
> themselves correctly, and we should register them correctly in CastKit. Based
> on the type of device, we can properly configure the `@media` queries to
> ensure proper styling for any given context.

CSS has exactly the features this wants. `update: slow` is the media query the
CSS Working Group added *for ePaper*. `monochrome: 1` is a 1-bit panel.
`pointer: none` is a display with no input. On paper the browser already models
the whole property table.

It does not survive contact with the fleet, in three separate ways.

**The image half renders on the server.** Measured in this repo's own headless
Chromium on 2026-09-13, rendering for an Inky pHAT — a 250×122 one-bit ePaper
with no input at all:

| Media feature | Reports | True for the pHAT |
| --- | --- | --- |
| `(update: fast)` | `true` | no — `slow` |
| `(monochrome: 0)` | `true` | no — `monochrome: 1` |
| `(color)` | `true` | no |
| `(pointer: fine)` | `true` | no — `pointer: none` |

Four features, four wrong answers, no error. The renderer is describing itself.

**Chromium will not let us correct it.** `Emulation.setEmulatedMedia` over CDP
accepts an arbitrary `{ name, value }` feature list and returns success for
`update`, `monochrome`, `pointer` and `color` — and changes nothing. Verified
the same day: every one of the four values above is identical before and after
the call. It is a silent false pass, the worst failure shape we have. Only
`hasTouch` at the browser-context level moves anything, flipping
`pointer: coarse` and `hover: none`, and that is a test-harness setting with no
equivalent on real hardware.

**The live half cannot report it either.** A HyperPixel kiosk runs Chromium on
a Pi driving an LCD, so `update: fast` is true and useless. The M5Paper and the
WT32 run no browser at all, so there is no media-query evaluator anywhere in
their chain — the pixels are composed on the server and sent as a frame.

## Why

CastKit is the only participant that knows what the glass is. It holds the
device record; the browser holds a viewport. Stamping turns a fact we have into
a fact the stylesheet can read, and it reads identically in all three delivery
paths, in Storybook, and in a screenshot test.

An attribute selector is not a worse tool than a media query here. It is the
same cascade, it is inspectable in DevTools, it can be forced in a test by
setting one attribute, and — unlike the media features — it cannot quietly
report the wrong thing, because nothing else writes it.

Keeping size and user preferences on real `@media` matters just as much. Those
the document does know, a stamped copy of them would drift the moment a panel
is re-registered at a new size, and the existing short-landscape query has
already earned its place.

The ban is written as a lint-able rule rather than a habit, because the failure
mode is invisible. A view that branches on `(monochrome)` looks correct in
review, renders correctly on a developer's machine, and is simply dead code on
every panel in the house.

## Evidence

Probe run 2026-09-13 against the image's Playwright Chromium (`chromium-1243`),
default headless context, then again after each CDP call:

```
default headless: updateFast=true updateSlow=false monochrome=false
                  color=true pointerFine=true hoverNone=false
emulate update=slow      -> unchanged
emulate monochrome=1     -> unchanged
emulate pointer=none     -> unchanged
emulate color=0          -> unchanged
hasTouch context         -> pointerCoarse=true hoverNone=true
```

The fleet's own media-query reality, from `home-displays/AGENTS.md`: three
panels run Chromium on a Pi, two run ESPHome firmware with no browser, and two
are dumb fetchers displaying a PNG.

Chat: T3 Code thread `a7e03562-acab-4308-ba0d-fc93531ece7f`.
