import type { ViewDefinition } from "@castkit/sdk/contracts"

/** Optional view-owned tokens leave the renderer and component library replaceable. */
export const viewAppearance = (view: ViewDefinition) => ({
  "--font-sans": view.appearance?.fontFamily,
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
