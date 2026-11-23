# AI Usage marks and titles come from the producer

- **Status:** Accepted
- **Date:** 2026-11-22
- **Type:** Data contract
- **Supersedes:** [2026-10-05 — AI Usage shows provider icons and omits plans](2026-10-05-ai-usage-shows-provider-icons-and-omits-plans.md), in part: only where the marks come from. The view still shows a mark beside each provider and still omits plans.
- **Superseded by:** None

## Decision

CastKit keeps no logos and no product titles for AI subscriptions. The
`ai-usage.v1` contract carries each provider's `mark`:

```ts
mark?: {
  viewBox: string // "minX minY width height"
  paths: { d: string; opacity?: number }[] // at least one
  strokeWidth?: number // set ⇒ an outline, not a fill
}
```

The AI Usage source reads the producer's `brand` on each provider
(`brand.title`, and `brand.mark` with `view_box`, `paths`, and `stroke_width`).
It uses `brand.title` as the product name, before the owner subtag. A mark
that does not fit the contract is dropped, and the provider's usage is kept.
A producer that sends no brand gets the provider id in title case, without its
seat number (`claude_3` reads "Claude"), and no mark.

`AiUsageProviderIcon` draws `provider.mark`: the paths fill with the current
color, or, with `strokeWidth`, draw as an outline with round caps and joins.
A provider with no mark draws none.

A plugin view bound to an `ai-usage.v1` channel gets the same `mark`, so it
needs no logos either.

## Context

The view drew marks from a table of three SVG paths in
`AiUsageProviderIcon.tsx`, keyed by provider id, and the source kept a table of
product titles. When the producer added a Gemini card, every CastKit view
showed it with no mark until someone copied another logo into CastKit.

## Why

The producer already sends the usage, the reset times, and the owner subtag
for each card. The mark and the title are facts about the same card, and the
producer already has them. A copy in CastKit goes out of date each time the
producer adds a provider.

## Evidence

The owner, 2026-11-22, after a Gemini card appeared with no mark:

> CastKit is just a display of data. This plugin is just a way to display AI
> Usage stats. It shouldn't have to hold every image's info since AI-Usage has
> that including Pi and OpenCode and other areas.
>
> If someone else used this plugin, they'd also expect to give it data for each
> card saying the avatar, harness/subscription, % used, reset time, etc. It's
> weird that _only_ the model image would be stored in CastKit hard-coded.

## Code

`packages/sdk/src/contracts.ts` (`usageMarkSchema`),
`packages/server/src/platform/sources/aiUsage.ts`,
`packages/slatecast/src/platform/AiUsageProviderIcon.tsx`, and the tests beside
them.
