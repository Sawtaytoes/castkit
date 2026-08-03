import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App.tsx"
import { installPanelFonts } from "./storybook/panelFontFaceCss.ts"

/*
  The dev preview exists to match the device render; in the browser's fallback
  sans-serif it does not. Install the panel faces first — see
  `panelFontFaceCss.ts`.
*/
void installPanelFonts()

const rootElement = document.getElementById("root")

if (!rootElement) {
  throw new Error("Inkcast dev preview: #root not found")
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
