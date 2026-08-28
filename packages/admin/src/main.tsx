import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router"
import { App } from "./App.tsx"
import "./styles/tailwind.css"

const rootElement = document.getElementById("root")

if (rootElement) {
  createRoot(rootElement).render(
    <BrowserRouter basename="/manage">
      <App />
    </BrowserRouter>,
  )
}
