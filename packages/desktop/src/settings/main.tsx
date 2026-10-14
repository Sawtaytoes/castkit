import { createRoot } from "react-dom/client"
import { SettingsApp } from "./SettingsApp.tsx"
import "./settings.css"

const rootElement = document.getElementById("root")

if (rootElement) {
  createRoot(rootElement).render(<SettingsApp />)
}
