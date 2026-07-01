# E-ink fonts for Inkcast

This is a research note on typefaces that read well on e-ink / e-paper displays, gathered
to help pick a body font for Inkcast's rendered views. Inkcast currently ships **DejaVu
Sans** as a placeholder: the Satori engine has no system-font access, so it embeds the raw
DejaVu Sans TTF bytes to stay visually consistent with the pHAT's on-device `fonts-dejavu`
rendering (see `packages/render/src/fonts.ts`). DejaVu is a fine, safe default — it is
MIT/Bitstream-Vera licensed and freely embeddable — but it was never designed for e-ink, so
this note surveys purpose-built and community-favored alternatives. Because Inkcast is an
open-source public repo and Satori needs the raw TTF/OTF to embed, we strongly prefer
**SIL OFL / Apache / BSD / CC-BY** fonts available as TTF or OTF. Two display contexts are
addressed separately: the tiny **1-bit mono** 250x122 Inky pHAT (legibility at very small
sizes after 1-bit dithering, no anti-aliasing) and the larger **6-colour E6** 800x480 Inky
Impression (more room; readability plus aesthetics).

## What matters on e-ink

The recurring theme across e-reader communities and small-screen typography research: at
low DPI and after 1-bit dithering, letters survive when they have a **large x-height**,
**open counters/apertures** (so enclosed spaces don't fill in), **sturdy, even stroke
weight** (low stroke contrast — little difference between thick and thin strokes), and
**good hinting**. Hinting still matters on e-readers despite higher-DPI panels
([MobileRead](https://www.mobileread.com/forums/showthread.php?t=366520)). For the tiny
1-bit panel specifically, sans-serif forms tend to survive better because their simpler
shapes are less prone to blurring/filling, and open counters resist filling in at small
sizes ([TypeTogether](https://www.type-together.com/typefaces-small-text),
[FontOrbit](https://fontorbit.com/smallest-font-type/)).

## Recommendations table

| Font | Serif/Sans | License | Best for | Why it reads well on e-ink | Source |
| --- | --- | --- | --- | --- | --- |
| **Atkinson Hyperlegible** | Sans (grotesque) | SIL OFL 1.1 | mono + E6 | Purpose-built by the Braille Institute so every character is maximally distinguishable; exaggerated, disambiguated letterforms "shine on screens where lower resolution can make similar letters harder to distinguish." Clear x-height and open counters aid caption/footnote sizes. | [Braille Institute](https://www.brailleinstitute.org/freefont/), [Wikipedia](https://en.wikipedia.org/wiki/Atkinson_Hyperlegible), [TypeSmith](https://typographysmith.com/fonts/atkinson-hyperlegible) |
| **Luciole** | Sans | CC-BY 4.0 | mono + E6 | Designed explicitly for low-vision readers against a dozen legibility criteria (letter structure, word clutter, spacing) by the French typographies.fr foundry with the Regional Technical Centre for Visual Impairment. Disambiguated forms help at low resolution. | [luciole-vision.com](https://www.luciole-vision.com/), [printindustry.news](https://www.printindustry.news/story/32904/) |
| **Lexend** | Sans | SIL OFL 1.1 | mono + E6 | Tall x-height with open counters, "legible from small sizes up to large ones"; designed to reduce visual stress and improve reading performance. | [Google Fonts](https://fonts.google.com/specimen/Lexend), [lexend OFL](https://github.com/googlefonts/lexend/blob/main/OFL.txt) |
| **Public Sans** | Sans | SIL OFL 1.1 | mono + E6 | US-government (USWDS) "strict neutral" sans, a modified version of Libre Franklin; sturdy, even, high legibility for UI text. Good for labels/chrome on both panels. | [USWDS Public Sans](https://github.com/uswds/public-sans/blob/develop/LICENSE.md) |
| **Libre Franklin** | Sans | SIL OFL 1.1 | E6 | Franklin Gothic revival; sturdy grotesque with good weight range for headers on the larger panel. | [search: Libre Franklin OFL](https://github.com/uswds/public-sans/blob/develop/LICENSE.md) |
| **Go (Go Regular/Smallcaps)** | Sans + mono | BSD-3-Clause | mono + E6 | Commissioned for the Go project; larger x-height aids small sizes on screen, and the sans is well-hinted. Unusually permissive license. | [go.dev/blog/go-fonts](https://go.dev/blog/go-fonts), [Font Squirrel](https://www.fontsquirrel.com/license/go) |
| **iA Writer Quattro / Duo / Mono** | Sans (Quattro/Duo), mono | SIL OFL 1.1 | E6 | iA's writing faces, tuned for on-screen text clarity; Quattro is proportional-feeling. Clean, even strokes. | [iA-Fonts](https://github.com/iaolo/iA-Fonts), [Fontsource](https://fontsource.org/fonts/ia-writer-quattro) |
| **Inter** | Sans | SIL OFL 1.1 | E6 | Very high x-height, large apertures, extensive hinting; a modern UI workhorse that stays legible small. Best where anti-aliasing exists (E6), less ideal after 1-bit dithering. | [Google Fonts](https://fonts.google.com/specimen/Inter) |
| **Bitter** | Slab serif | SIL OFL 1.1 | E6 (and mono at larger sizes) | Designed by Sol Matas specifically to read comfortably on screens: **large x-height** and **thick, even (low-contrast) strokes** — exactly the traits that survive dithering. Cited by r/eink-adjacent readers as a "low contrast" e-reader font. | [Google Fonts](https://fonts.google.com/specimen/Bitter), [MobileRead](https://www.mobileread.com/forums/showthread.php?t=366520) |
| **Literata** | Serif | SIL OFL 1.1 | E6 | TypeTogether's typeface for Google Play Books, built to read well "on a whole range of devices... running different rendering technologies." Organic texture, comfortable for long-form. | [TypeTogether](https://www.type-together.com/literata-book), [Google Fonts](https://fonts.google.com/specimen/Literata) |
| **Newsreader** | Serif | SIL OFL 1.1 | E6 | Production Type face made for "continuous on-screen reading in content-rich environments." | [nicoverbruggen/ebook-fonts](https://github.com/nicoverbruggen/ebook-fonts) |
| **Source Serif 4** | Serif | SIL OFL 1.1 | E6 | Adobe's open serif designed for digital; simplified, highly readable letter shapes. Community "Sourcerer" variant is thickened for e-readers. | [nicoverbruggen/ebook-fonts](https://github.com/nicoverbruggen/ebook-fonts) |
| **Charter / XCharter** | Serif | Permissive (Bitstream, free) | E6 | Matthew Carter's 1987 body face explicitly built to hold up on **low-resolution** output (fax, 300 dpi lasers); ages into e-ink well. | [EditionGuard](https://www.editionguard.com/learn/best-fonts-e-books/) |
| **Charis SIL** | Serif | SIL OFL 1.1 | E6 | A Charter-family SIL font; e-reader users add weight to it for Kobo readability. Broad glyph coverage. | [MobileRead](https://www.mobileread.com/forums/showthread.php?t=366520) |
| **Alegreya** | Serif | SIL OFL 1.1 | E6 | Named alongside Bitter/Literata by e-reader users as a "low contrast" face that reads easily. | [MobileRead](https://www.mobileread.com/forums/showthread.php?t=366520) |
| **PT Serif** | Serif | SIL OFL 1.1 | E6 | Validated across iOS Books / Kindle / Kobo / EPUB readers for legibility and reduced fatigue. | [EditionGuard](https://www.editionguard.com/learn/best-fonts-e-books/) |
| **Georgia** | Serif | Proprietary (Microsoft) | (reference only) | The most consistently praised e-ink serif — large x-height, thickened serifs, drawn pixel-first for sharp low-DPI rendering — but **proprietary**, so not embeddable in an OSS repo. Listed as the quality bar to match. | [EditionGuard](https://www.editionguard.com/learn/best-fonts-e-books/) |
| **Bookerly** | Serif | Proprietary (Amazon/Dalton Maag) | (reference only) | Kindle's default since 2015, tuned for e-ink contrast ratios and hinting-artifact-free at small device sizes — but **proprietary/Kindle-only**, not redistributable. | [EditionGuard](https://www.editionguard.com/learn/best-fonts-e-books/) |
| **DejaVu Sans** (current) | Sans | MIT / Bitstream Vera (free, embeddable) | mono (placeholder) | Safe, ubiquitous, matches on-device `fonts-dejavu`, freely embeddable. Not e-ink-designed; hinting at very small sizes is a known weak spot in the project. | [DejaVu License](https://dejavu-fonts.github.io/License.html), [Wikipedia](https://en.wikipedia.org/wiki/DejaVu_fonts) |

## Top picks for Inkcast

### Tiny 1-bit mono pHAT (250x122)

After 1-bit dithering there is no anti-aliasing, so the winners are sturdy, high-x-height
**sans** faces with disambiguated letterforms and open counters.

1. **Atkinson Hyperlegible (SIL OFL, TTF available)** — the strongest candidate. It is
   purpose-built so every glyph is maximally distinguishable, and its exaggerated forms are
   explicitly noted to help "on screens where lower resolution can make similar letters
   harder to distinguish"
   ([Wikipedia](https://en.wikipedia.org/wiki/Atkinson_Hyperlegible)). That disambiguation
   (e.g. distinct 1/l/I, 0/O, b/d) is exactly what a 1-bit panel needs, where similar shapes
   collapse together. Caveat worth testing: one developer reported it feels "quite cramped"
   below ~16px with vertical-metric quirks
   ([shkspr.mobi](https://shkspr.mobi/blog/2022/08/an-update-to-the-atkinson-hyperlegible-font/)),
   so bake off a couple of sizes on-device. It ships as OTF/TTF from the Braille Institute
   and Google Fonts — perfect for Satori embedding.
2. **Luciole (CC-BY 4.0, TTF available)** — the other low-vision-first face; designed
   against a dozen legibility criteria and freely redistributable with attribution. A good
   A/B partner against Atkinson on the mono panel.
3. **Lexend (SIL OFL, TTF available)** — tall x-height and open counters keep it legible at
   small sizes; a cleaner, more neutral fallback if Atkinson's exaggeration looks too loud
   on the tiny panel.

If you want to keep DejaVu's zero-risk familiarity but improve small-size crispness on the
mono panel, Atkinson Hyperlegible is the low-effort swap (same OSS-friendly embedding story,
better disambiguation).

### Larger 6-colour E6 Impression (800x480)

More room and (some) tonal rendering means serifs become attractive for long-form comfort,
and body vs. header can differ.

1. **Literata (SIL OFL, TTF available)** — a serif literally engineered for e-reading across
   varied rendering tech; comfortable for paragraphs and pleasant at 800x480.
2. **Bitter (SIL OFL, TTF available)** — slab serif with a large x-height and thick, even
   strokes; the low stroke-contrast holds up especially well and it pairs nicely as a body
   or heavy header.
3. **Atkinson Hyperlegible or Public Sans (both SIL OFL)** for UI chrome/labels/now-playing
   metadata — keeping a single OFL sans across both panels simplifies embedding and keeps a
   consistent look, while a serif carries any long text on the E6.

All top picks are OFL/CC-BY/BSD and available as raw TTF/OTF, satisfying Satori's embed
requirement and Inkcast's OSS-redistribution needs.

## Provenance notes

None of the recommended fonts are Chinese-origin. For the record on foundry/origin:
Atkinson Hyperlegible — Braille Institute of America + Applied Design Works (US); Luciole —
typographies.fr with the CTRDV (France); Lexend / Public Sans / Libre Franklin — US
(Bonnie Shaver-Troup / Thomas Jockin; USWDS; Impallari Type); Go fonts — the Go project
(Bigelow & Holmes, US); Bitter — Sol Matas / Huerta Tipográfica (Argentina); Literata /
Alegreya — TypeTogether / Huerta Tipográfica; Source Serif — Adobe (US); iA fonts — iA
(Germany/Switzerland/Japan-based studio, fonts under OFL); Inter — Rasmus Andersson
(Sweden). Georgia (Microsoft) and Bookerly (Amazon/Dalton Maag) are proprietary and listed
only as quality references, not for embedding.

## A note on the source thread

The primary requested source — the r/eink thread "what are your favourite fonts for eink
reading" (https://www.reddit.com/r/eink/comments/13qjg27/) — could not be fetched directly:
Reddit blocked the direct URL, the `.json` API, and `old.reddit.com` from this environment.
The community sentiment was instead captured from the closely parallel MobileRead thread
"Fonts for readability on eink?" and general e-reader font roundups, which surface the same
recommendations (Charis SIL, Georgia, Atkinson Hyperlegible, Gill Sans, and the
low-contrast trio Bitter / Alegreya / Literata). The MobileRead consensus, per user
*hobnail*, favors **low-contrast fonts** — "less difference between the thick parts of a
glyph and the thin parts" — which matches the e-ink design principles above.

## Sources

- r/eink — "What are your favourite fonts for eink reading?" (requested primary source; not
  directly fetchable from this environment):
  https://www.reddit.com/r/eink/comments/13qjg27/what_are_your_favourite_fonts_for_eink_reading/
- MobileRead — "Fonts for readability on eink?": https://www.mobileread.com/forums/showthread.php?t=366520
- Atkinson Hyperlegible — Braille Institute: https://www.brailleinstitute.org/freefont/
- Atkinson Hyperlegible — Wikipedia: https://en.wikipedia.org/wiki/Atkinson_Hyperlegible
- Atkinson Hyperlegible — Google Fonts: https://fonts.google.com/specimen/Atkinson+Hyperlegible
- Atkinson Hyperlegible — GitHub: https://github.com/googlefonts/atkinson-hyperlegible
- Atkinson Hyperlegible small-size note: https://shkspr.mobi/blog/2022/08/an-update-to-the-atkinson-hyperlegible-font/
- Atkinson Hyperlegible — TypeSmith guide: https://typographysmith.com/fonts/atkinson-hyperlegible
- Luciole typeface: https://www.luciole-vision.com/
- Luciole — PrintIndustry.news: https://www.printindustry.news/story/32904/
- Lexend — Google Fonts: https://fonts.google.com/specimen/Lexend
- Lexend — OFL license: https://github.com/googlefonts/lexend/blob/main/OFL.txt
- Public Sans — USWDS license: https://github.com/uswds/public-sans/blob/develop/LICENSE.md
- Go fonts — go.dev blog: https://go.dev/blog/go-fonts
- Go fonts — Font Squirrel license: https://www.fontsquirrel.com/license/go
- iA Fonts — GitHub: https://github.com/iaolo/iA-Fonts
- iA Writer Quattro — Fontsource: https://fontsource.org/fonts/ia-writer-quattro
- Inter — Google Fonts: https://fonts.google.com/specimen/Inter
- Bitter — Google Fonts: https://fonts.google.com/specimen/Bitter
- Literata — TypeTogether: https://www.type-together.com/literata-book
- Literata — Google Fonts: https://fonts.google.com/specimen/Literata
- Newsreader / Source Serif / Sourcerer — nicoverbruggen ebook-fonts: https://github.com/nicoverbruggen/ebook-fonts
- Georgia / Bookerly / Charter / PT Serif roundup — EditionGuard: https://www.editionguard.com/learn/best-fonts-e-books/
- Small-text typography — TypeTogether: https://www.type-together.com/typefaces-small-text
- Smallest / small-space fonts — FontOrbit: https://fontorbit.com/smallest-font-type/
- DejaVu fonts — license: https://dejavu-fonts.github.io/License.html
- DejaVu fonts — Wikipedia: https://en.wikipedia.org/wiki/DejaVu_fonts
