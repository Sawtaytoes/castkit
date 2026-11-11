import type { ViewDefinition } from "@castkit/sdk/contracts"

/**
 * A chosen font family rarely carries kana or kanji, so Noto Sans JP follows it
 * (see `japaneseFont.css`). The browser falls through per character, so the
 * chosen face still draws every glyph it has.
 */
const withJapaneseFallback = (
  fontFamily: string | undefined,
) =>
  fontFamily ? `${fontFamily}, "Noto Sans JP"` : undefined

/** Optional view-owned tokens leave the renderer and component library replaceable. */
export const viewAppearance = (view: ViewDefinition) => ({
  "--font-sans": withJapaneseFallback(
    view.appearance?.fontFamily,
  ),
  "--bg": view.appearance?.backgroundColor,
  "--fg": view.appearance?.textColor,
  "--accent": view.appearance?.accentColor,
  "--accent-content": view.appearance?.accentColor,
  ...(view.appearance?.backgroundColor
    ? {
        "--surface": `color-mix(in srgb, ${view.appearance.backgroundColor} 92%, ${view.appearance.textColor ?? "#ffffff"})`,
      }
    : {}),
  ...(view.appearance?.textColor
    ? {
        "--fg-dim": `color-mix(in srgb, ${view.appearance.textColor} 75%, ${view.appearance.backgroundColor ?? "#000000"})`,
      }
    : {}),
})
