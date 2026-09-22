import { ReactRouterAdapter } from "@charcuterie/ui/react-router"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router"
import { App } from "./App.tsx"
import "./styles/tailwind.css"

const rootElement = document.getElementById("root")

if (rootElement) {
  createRoot(rootElement).render(
    <BrowserRouter basename="/manage">
      {/* One component at the root carries every seam of its kind.
          `@charcuterie/ui` 4.0 moved the scroll memory off `Main`'s
          `scrollKey` prop onto a context, and an app that renders no
          adapter simply gets no memory — a silent miss, which is why
          this is wired rather than left. */}
      <ReactRouterAdapter>
        <App />
      </ReactRouterAdapter>
    </BrowserRouter>,
  )
}
