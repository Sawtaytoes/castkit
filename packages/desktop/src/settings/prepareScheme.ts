// The color scheme follows the system setting, set before the first paint
// as every Charcuterie app does (the CSP allows no inline script for it),
// and again whenever the system setting changes.
const darkQuery = window.matchMedia(
  "(prefers-color-scheme: dark)",
)
const applyScheme = () => {
  document.documentElement.setAttribute(
    "data-scheme",
    darkQuery.matches ? "dark" : "light",
  )
}
applyScheme()
darkQuery.addEventListener("change", applyScheme)
