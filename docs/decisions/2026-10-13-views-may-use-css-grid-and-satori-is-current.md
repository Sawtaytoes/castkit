# Views may use CSS grid, and Satori is kept current

- **Status:** Accepted
- **Date:** 2026-10-13
- **Type:** technical
- **Supersedes:** [Views use inline style objects (Satori-safe), not Emotion or Tailwind](2026-07-01-inline-styles-for-views.md) — the flexbox-only limit
- **Superseded by:** [Image views render with Satori, and Chromium closes when idle](2026-10-14-image-views-render-with-satori-and-chromium-closes-when-idle.md) — item 4 only

## Decision

1. The device-bound views in `@castkit/views` may use **CSS grid** and the rest of the CSS
   Satori supports (block layout, `filter`, `backdropFilter`, `transform`, `aspectRatio`,
   …), not only flexbox. Do not rewrite a layout as nested flex rows to stay "Satori-safe".
2. Views still style themselves with **inline `style` objects**, not Emotion, Tailwind or
   external stylesheets. That half of the 2026-07-01 decision stands: Satori takes styles
   from the element tree, and the owner already chose custom CSS for bespoke views.
3. `satori` in `@castkit/render` tracks the **latest** release, like every other
   dependency. It sat at 0.26.0 because `^0.26.0` on a `0.x` version never moves a minor.
4. Before relying on Satori for a view, run `pnpm bakeoff:views chromium`,
   `pnpm bakeoff:views satori`, and `pnpm bakeoff:views:compare`, and open
   `render-output/satori-bakeoff/index.html`. Chromium stays the production engine
   (`INKCAST_RENDER_ENGINE=chromium`).

## Context

The 2026-07-01 limit existed because Satori then laid out with Yoga and understood only
inline styles with a flexbox subset. Satori 0.43.0 (2026-10-08, vercel/satori#841) replaced
Yoga with Taffy and added `display: grid` and `display: block`; filters, transforms and
WOFF2 fonts followed. The [bake-off](../2026-10-13-satori-against-chromium.md) rendered all
10 server views on the four image panel sizes: Satori 0.56.1 rendered 40 of 40 with a
median 1.25% of pixels differing from Chromium (maximum 9.3%, text 1–3 px lower) at a median
2.5x the speed. Satori 0.26.0 rendered 36 of 40, differed by up to 37%, and crashed the whole
process with a resvg panic on Photo Frame (Agenda).

## Why

The limit no longer protects anything: production renders with Chromium, and current Satori
draws grid layouts anyway. Keeping it made every view pay for a constraint that was fixed
upstream.

## Evidence

Owner, T3 Code, 2026-10-13, after learning Satori now supports grid:

> Also, it sounds like we *should* use Grid and that other CSS stuff now. We don't need to
> limit ourselves in AGENTS.

> Upgrade it then, run the VRT suite, and see what changes between it and Chromium. Then get
> us some data on it.
