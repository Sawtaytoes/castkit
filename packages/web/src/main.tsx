import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router"
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
    {/* One route today. It is a router anyway, per the fleet decision
        2026-08-16-owned-web-apps-use-react-router-with-path-urls: every app we
        own gets one, including the single-view ones, so the second view is a
        route rather than a `useState` fork bolted on later.

        Scope note, because this repo has three browser surfaces and only one of
        them is this: `/d/:id` is SERVER-rendered per device and already a real
        path — that server is the router — and `packages/slatecast` is the panel
        it boots, which has exactly one view and gets its device id from the
        rendered HTML rather than from the URL. Neither has client routing to
        add. This is the dev preview. */}
    <BrowserRouter>
      <Routes>
        <Route element={<App />} path="/" />
        <Route
          element={<Navigate replace to="/" />}
          path="*"
        />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
