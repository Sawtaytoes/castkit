/**
 * The CastKit mark in the header, and the way home.
 *
 * The favicon beside the name, linking to `/` — the public library of views
 * and screens — the way every owned app's header mark works. This replaced a
 * separate `Home` link beside a heading that did nothing (2026-09-28); see
 * docs/decisions/2026-09-28-a-screens-views-are-tabs-across-its-header.md.
 *
 * A plain anchor, not a router `Link`: management lives under `/manage` in a
 * `BrowserRouter` with that basename, and `/` is outside it.
 */
export const Brand = () => (
  <a
    className="flex min-w-0 items-center gap-3 rounded-md text-content-primary no-underline hover:opacity-80"
    href="/"
  >
    <img
      alt=""
      className="size-7 rounded-md"
      src={`${import.meta.env.BASE_URL}favicon.svg`}
    />
    <span className="min-w-0 truncate font-display text-lg font-semibold">
      CastKit
    </span>
  </a>
)
